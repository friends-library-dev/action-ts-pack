import * as core from '@actions/core';
import { podPackageId, LuluClient, LuluAPI } from '@friends-library/lulu';
import { Client as DbClient, Order } from '@friends-library/db';
import { fetch as fetchMeta, DocumentMeta } from '@friends-library/document-meta';
import log from '@friends-library/slack';
import { getAllFriends, setResolveMap } from '@friends-library/friends/query';
import { Edition, jsFriendMap } from '@friends-library/friends';

async function main(): Promise<void> {
  setResolveMap(jsFriendMap);
  const db = new DbClient(
    process.env.INPUT_FLP_API_ENDPOINT || ``,
    process.env.INPUT_FLP_API_TOKEN ?? ``,
  );
  const lulu = getLuluClient();
  const meta = await fetchMeta();

  const findOrders = await db.orders.findByPrintJobStatus(`presubmit`);
  if (!findOrders.success) {
    log.error(`Error retrieving presubmit orders from db`, { error: findOrders.error });
    return;
  }

  const { value: orders } = findOrders;
  if (orders.length === 0) {
    log.debug(`No orders in state \`presubmit\` to process from gh action.`);
    return;
  }

  for (const order of orders) {
    try {
      var payload = createPrintJobPayload(order, meta);
    } catch (err) {
      log.error((err as Error).message);
      continue;
    }

    const [printJob, status] = await lulu.createPrintJob(payload);
    if (status !== 201) {
      log.error(`Error creating print job for order ${order.id}`, {
        res: printJob,
        status,
      });
      continue;
    }

    const jobStatus = printJob.status.name;
    if (jobStatus !== `CREATED`) {
      log.error(`Unexpected print job status ${jobStatus} for order ${order.id}`);
      continue;
    }

    log.order(`Created print job ${printJob.id} for order ${order.id}`);
    order.printJobId = printJob.id;
    order.printJobStatus = `pending`;

    let orderUpdated = false;
    for (const delay of DELAYS) {
      if (orderUpdated) continue;
      await sleep(delay);
      const saveResult = await db.orders.save(order);
      if (saveResult.success) orderUpdated = true;
    }

    if (!orderUpdated) {
      log.error(`Error updating order print job details, order: ${order.id}`);
      // @TODO cancel print job to prevent duplicate print jobs!!!!
      continue;
    }

    // allow time for Lulu to validate the print job
    core.info(`Waiting ${VERIFY_DELAY / 1000} seconds before verifying acceptance...`);
    await sleep(VERIFY_DELAY);

    const [res, httpStatus] = await lulu.printJobStatus(printJob.id);
    if (httpStatus !== 200) {
      log.error(`Unexpected response getting print job ${printJob.id} status`, {
        res,
        httpStatus,
      });
      continue;
    }

    if ([`ERROR`, `CANCELED`, `REJECTED`].includes(res.name)) {
      log.error(`Print job ${printJob.id} for order ${order.id} rejected`, { res });
      order.printJobStatus = `rejected`;
    } else {
      log.order(`Verified acceptance of print job ${printJob.id}, status: ${res.name}`);
      order.printJobStatus = `accepted`;
    }

    const saveResult = await db.orders.save(order);
    if (!saveResult.success) {
      log.error(`Error updating print job ${printJob.id} status`, {
        error: saveResult.error,
      });
    }
  }
}

main();

const MAX_DELAY = 25000;
const VERIFY_DELAY = 180000;
const DELAYS = [0, 5000, MAX_DELAY];

function createPrintJobPayload(
  order: Order,
  meta: DocumentMeta,
): LuluAPI.CreatePrintJobPayload {
  return {
    external_id: order.id,
    shipping_level: order.shippingLevel,
    contact_email: `jared@netrivet.com`,
    shipping_address: {
      name: order.address.name,
      street1: order.address.street,
      ...(order.address.street2 ? { street2: order.address.street2 } : {}),
      city: order.address.city,
      country_code: order.address.country,
      state_code: order.address.state,
      postcode: order.address.zip,
    },
    line_items: order.items.flatMap((item) => printJobLineItem(item, meta, order)),
  };
}

function printJobLineItem(
  item: Order['items'][0],
  meta: DocumentMeta,
  order: Order,
): LuluAPI.CreatePrintJobPayload['line_items'][0][] {
  const key = `${order.lang}/${item.documentId}/${item.editionType}`;

  // @TODO - should probably get edition data from the API -- as there is a
  // hidden dependency on this action/ts-pack repo getting rebuilt everytime
  // we add a new book, if a customer buys a new book before this repo is
  // updated, it won't be found.  there is some complexity around multi-vol
  // books, but better to duplicate a bit of filename logic than have this issue.
  // the other thing we could do is have an API endpoint that we could use to hydrate a
  // friend/doc/edition entity.... but... that's a bit janky
  // probably better is a c printf style placeholder paperback-cover-multivol filename
  // or... we could have a github action webhook to rebuild this repo with latest /friends repo?

  // UPDATE 10/1/21 - setup a GH action to auto republish this, updating the friends repo
  // core issue of datasource wonkiness remains, should be solved by the great API/DB refactor
  // @see https://github.com/friends-library-dev/issues/issues/46
  const edition = editions().get(key);
  if (!edition) throw new Error(`404 Edition from order item: ${key}`);

  const edMeta = meta.get(edition.path);
  if (!edMeta) throw new Error(`404 edition meta from order item: ${key}`);
  const cloudUrl = process.env.INPUT_CLOUD_STORAGE_BUCKET_URL || ``;
  const url = `${cloudUrl}/${edition.path}`;
  const printSize = edMeta.paperback.size;
  const volumes = edMeta.paperback.volumes.map((p, idx) => [p, idx + 1]);
  const isMulti = volumes.length > 1;
  return volumes.map(([numPages, vol]) => ({
    title: `${edition.document.title}${isMulti ? `, vol. ${vol}` : ``}`,
    cover: `${url}/${edition.filename(`paperback-cover`, isMulti ? vol : void 0)}`,
    interior: `${url}/${edition.filename(`paperback-interior`, isMulti ? vol : void 0)}`,
    pod_package_id: podPackageId(printSize, numPages),
    quantity: item.quantity,
  }));
}

const editionMap = new Map<string, Edition>();

function editions(): Map<string, Edition> {
  if (editionMap.size > 0) {
    return editionMap;
  }

  const friends = getAllFriends(`en`, true).concat(getAllFriends(`es`, true));
  friends.forEach((friend) =>
    friend.documents.forEach((document) =>
      document.editions.forEach((edition) => {
        editionMap.set(`${friend.lang}/${document.id}/${edition.type}`, edition);
      }),
    ),
  );
  return editionMap;
}

function getLuluClient(): LuluClient {
  return new LuluClient({
    clientKey: process.env.INPUT_LULU_CLIENT_KEY || ``,
    clientSecret: process.env.INPUT_LULU_CLIENT_SECRET || ``,
    sandbox: String(process.env.INPUT_LULU_IS_SANDBOX) !== `false`,
  });
}

function sleep(ms: number): Promise<void> {
  if (ms === 0) return Promise.resolve();
  return new Promise((res) => setTimeout(res, ms));
}
