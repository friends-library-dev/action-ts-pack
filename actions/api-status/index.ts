import fetch from 'cross-fetch';
import log from '@friends-library/slack';

async function main(): Promise<void> {
  try {
    const res = await fetch(process.env.INPUT_FLP_API_ENDPOINT ?? ``, {
      method: `POST`,
      headers: {
        Authorization: `Bearer ${process.env.INPUT_FLP_API_STATUS_QUERY_TOKEN}`,
        'Content-Type': `application/json`,
      },
      body: JSON.stringify({
        query: `query { counts: getModelsCounts { friends } }`,
      }),
    });
    const json = await res.json();
    const data = JSON.stringify(json.data.counts);
    log.debug(`:white_check_mark: _FLP_ *Api Status Check* success \`${data}\``);
  } catch (error: unknown) {
    log.error(`_FLP_ *Api Status Check* failed`, { error: String(error) });
  }

  try {
    const endpoint = process.env.INPUT_GERTRUDE_API_ENDPOINT ?? ``;
    const res = await fetch(`${endpoint}/releases`);
    const json = await res.json();
    const data = JSON.stringify(json[0].version);
    log.debug(`:white_check_mark: _Gertrude_ *Api Status Check* success \`${data}\``);
  } catch (error: unknown) {
    log.error(`_Gertrude_ *Api Status Check* failed`, { error: String(error) });
  }
}

main();
