require('dotenv').config();
const Mastodon = require('mastodon-api');
const fs = require('fs');
const request = require('request');

//Função para download de imagem por url
const download = function (url, path, callback) {
  request.head(url, function (err, res, body) {
    request(url).pipe(fs.createWriteStream(path)).on('close', callback);
  });
};

//Conexão com API do Mastodon
const M = new Mastodon({
  client_key: process.env.CLIENT_KEY,
  client_secret: process.env.CLIENT_SECRET,
  access_token: process.env.ACCESS_TOKEN,
  timeout_ms: 60 * 1000,
  api_url: 'https://botsin.space/api/v1/',
});
const stream = M.stream('streaming/user');
let cont = 0;
cabecalho('--START BOT--', ' ', ' ');
// Ouvindo menções
stream.on('message', async (response) => {
  if (response.event === 'notification' && response.data.type === 'mention') {
    cont++;
    cabecalho('INÍCIO STREAM', '~', cont);
    // Para baixar e ver a organização do json
    // fs.writeFileSync(
    //   `NOT-CONT${new Date().getTime()}.json`,
    //   JSON.stringify(response, null, 2)
    // );
    console.log(`RESPONSE.CONTENT:\n\t${response.data.status.content}\n`);
    console.log(
      `RESPONSE.CONTENT LIMPO:\n\t${response.data.status.content.replace(
        /<[^>]*>?/gm,
        ''
      )}\n`
    );

    const id_resp = response.data.status.id;
    const conta_resp = response.data.account.acct;
    const tags = response.data.status.tags.map((tag) => tag.name.toLowerCase());

    let tentativas = 0;
    let in_reply_to_id = response.data.status.in_reply_to_id;
    while (!in_reply_to_id && tentativas < 5) {
      console.log('in_reply_to_id missing, RETRYING...')
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = await M.get('statuses/:id', { id: id_resp });
      in_reply_to_id = response.data.in_reply_to_id;
      tentativas++;
    }
    if (!in_reply_to_id) {
      console.log('in_reply_to_id missing, ABORTING...')
      return;
    }

    console.log(`RESPONDER PARA: @${conta_resp}`);
    console.log(`TAGS USADAS: ${tags}\n`);
    console.log(`IN_REPLY_TO_ID: ${in_reply_to_id}`);

    //Procura #descrição de todas as formas nas Tags
    if (tags.length !== 0) {
      const valida_tag_descricao = tags.some(tag => tag.match(/^descri..o|descreva$/im));
      console.log(`Valida Descrição: ${valida_tag_descricao}`);

      if (in_reply_to_id !== null && valida_tag_descricao) {
        var conteudos_toot = formataContent(response.data.status.content);
        conteudos_toot.tags = tags;
        doTheJob(conteudos_toot, in_reply_to_id, id_resp, conta_resp);
      } else {
        // PARA DELETAR POST
        const deleta = tags.some((tag) => tag.match(/^delete|deleta$/im));
        console.log(`TENTATIVA DE DELETAR: ${deleta}`);
        if (deleta) {
          const { data } = await M.get('statuses/:id', { id: in_reply_to_id });
          console.log(`@${conta_resp} pediu para deletar: ${data.id}`);
          console.log(`\t\tURL: ${data.url}`);

          const txt = `cc: <span class="h-card"><a href="${response.data.account.url}"`;
          if (data.content.indexOf(txt) !== -1) {
            console.log(`DELETANDO..`);
            await M.delete('statuses/:id', { id: data.id });
          } else {
            console.log('NÃO FOI PERMITIDO DELETAR');
            console.log(`\t\tA descrição não é de @${conta_resp}`);
          }
          cabecalho('FIM DA VEZ', '-', cont);
        } else {
          console.log(`NÃO HÁ REPLY OU DESCRIÇÃO VÁLIDOS`);
          cabecalho('FIM DA VEZ', '-', cont);
        }
      }
    } else {
      console.log(`NÃO HÁ TAGS VÁLIDAS`);
      cabecalho('FIM DA VEZ', '-', cont);
    }
  }
});

function cabecalho(texto, caractere, cont) {
  const today = new Date();
  const date = `${today.getFullYear()}/${
    today.getMonth() + 1
  }/${today.getDate()}`;
  const time = `${today.getHours()}:${today.getMinutes()}:${today.getSeconds()}`;
  console.log(`\n${caractere.repeat(50)}`);
  console.log(`${texto} ${cont} - DT/HORA: ${date} - ${time}`);
  console.log(`${caractere.repeat(50)}\n`);
}

function formataContent(content) {
  let post_item = 0;
  let conteudos = {
    cw: false,
    sensitive: false,
    texto_cw: '',
    content: [''],
    url: '',
  };
  content = content
    .replace(/<p>>?/gm, '\n\n')
    .replace(/<br>>?/gm, '\n')
    .replace(/<[^>]*>?/gm, '')
    .replace(/#debug/im, '')
    .replace(/#oculta/im, '#oculta')
    .replace(/#cw/im, '#cw')
    .trim();

  if (content.match(/#oculta/im)) {
    conteudos.sensitive = true;
    post_item = content.lastIndexOf('#oculta');
    content = content.slice(0, post_item).trim();
  }
  if (content.match(/#cw/im)) {
    const post_item_d = content.lastIndexOf('#descr');
    conteudos.cw = true;
    post_item = content.lastIndexOf('#cw');
    if (post_item > post_item_d) {
      conteudos.texto_cw = content.slice(post_item + 3, content.length).trim();
      content = content.slice(0, post_item).trim();
    } else {
      conteudos.texto_cw = content.slice(post_item + 3, post_item_d).trim();
      content = content.slice(post_item_d, content.length).trim();
    }
    console.log(`CW: ${conteudos.texto_cw}\n`);
  }
  content = content.replace(/#descri..o|#descreva/im, '#descricao');
  post_item = content.lastIndexOf('#descri');
  conteudos.content[0] = content.slice(post_item + 10, content.length).trim();
  console.log(`DESCRIÇÃO FORMATADA:\n\t${conteudos.content[0]}`);

  return conteudos;
}

async function doTheJob(conteudos, in_reply_to_id, id_resp, conta_resp) {
  console.log(`REPLY TO: ${in_reply_to_id}\n`);
  let conteudo_get = await facaGet(in_reply_to_id);

  // Verifica visibilidade do toot
  if (conteudo_get !== 0) {
    const visivel = conteudo_get.data.visibility;
    if (visivel === 'private' || visivel === 'direct') {
      console.log(`VISIBILIDADE: Não compatível - ${visivel}`);
      conteudo_get = 0;
    } else {
      console.log(`VISIBILIDADE: OK  - ${visivel}`);
    }
  }

  //Verifica se houve Get válido e se há imagem no mesmo antes de continuar
  if (conteudo_get !== 0 && conteudo_get.data.media_attachments.length !== 0) {
    let url = conteudo_get.data.media_attachments[0].remote_url;
    if (url === null) url = conteudo_get.data.media_attachments[0].url;
    conteudos.url = conteudo_get.data.url;

    console.log(`URL DA IMAGEM: ${url}\n`);
    download(url, './imagem.png', async () => {
      //ASYNC PARA UPLOAD E TOOT
      const imagem = fs.createReadStream('./imagem.png');
      console.log(`UPLOAD DA IMG FEITO\n`);
      const uploadParams = {
        file: imagem,
        description: conteudos.content[0],
      };
      const uploadResponse = await M.post('media', uploadParams);
      const texto_original = conteudo_get.data.content
        .replace(/<p>>?/gm, '\n\n')
        .replace(/<br>>?/gm, '\n')
        .replace(/<[^>]*>?/gm, '');

      //PREPARANDO CONTEÚDO PARA O TOOT
      const tootParams = {
        status: `${texto_original}\n\n🔗: ${conteudos.url}\ncc: @${conta_resp} `,
        in_reply_to_id: id_resp,
        media_ids:
          uploadResponse.data.id !== null ? [uploadResponse.data.id] : [],
      };
      if (conteudos.cw) {
        tootParams.spoiler_text = conteudos.texto_cw;
      } else {
        tootParams.spoiler_text = conteudo_get.data.spoiler_text;
      }
      if (conteudo_get.data.sensitive === true) {
        conteudos.sensitive = true;
        tootParams.sensitive = true;
      }
      if (conteudos.tags.includes('debug')) {
        tootParams.visibility = 'direct';
      }

      //FAZER POST
      await M.post('statuses', tootParams);
      console.log('POST ✅ Done!');
      cabecalho('FIM DA VEZ', '-', cont);
    });
  } else {
    if (conteudo_get === 0) console.log(`Erro recebido do M.GET retorno 0`);
    else {
      if (conteudo_get.data.media_attachments.length === 0)
        console.log(`TOOT ORIGINAL SEM IMAGENS`);
    }
    cabecalho('FIM DA VEZ', '-', cont);
  }
}

async function facaGet(reply) {
  let ok = 1;

  //Para federar o conteúdo??
  const resposta = await M.get('statuses/:id', { id: reply }, (error, data) => {
    if (error) {
      // fs.writeFileSync(`JSON_ERROR.json`, JSON.stringify(data, null, 2));
      console.log(`ERRO na FacaGET \n\t${error}`);
      ok = 0;
    } else {
      // fs.writeFileSync(`JSON_RESP_OK.json`, JSON.stringify(data, null, 2));
      console.log(`STATUS ORIGINAL:\n\t${data.content}\n`);
    }
  });
  if (ok) {
    console.log(`COPIADO DE @${resposta.data.account.acct}\n`);
    return resposta;
  } else {
    console.log(`ERRO M.GET:\n\t${resposta.error}\n`);
    return 0;
  }
}
