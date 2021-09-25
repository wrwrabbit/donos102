const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const simplur = require('simplur');
const cyrillicToTranslit = require('cyrillic-to-translit-js');
const { Client: GoogleMapsClient } = require("@googlemaps/google-maps-services-js");

const db = require('../db/db');
const Geohash = require('../libs/geohash');
const serverUrl = require('../libs/serverUrl');

const sleep = (timeout = 500) => new Promise(resolve => {
  setTimeout(resolve, timeout);
});

// Set up settings
let botServerUrl;
const endpoint = uuidv4();

// Create Google maps services API instance
const googleMaps = new GoogleMapsClient({});

// Create bot instance
const bot = new Telegraf(process.env.TOKEN);

if (process.env.NODE_ENV !== 'production') {
  bot.use(Telegraf.log());
}

// Set telegram webhook
serverUrl().then((url) => {
  botServerUrl = url;
  bot.telegram.setWebhook(`${url}/${endpoint}`);
});

// Start command
bot.command('start', (ctx) => {
  return ctx.replyWithHTML('Привет! Это бот <b>Донос102</b>. Я умею генерить листовки для информационной войны и глючить. Я полностью написан с нуля, живу в одной из западных стран и не храню никакой информации о тех кто со мной общается, поэтому я очень тупой. Просто введите адрес указав <i>населенный пункт</i>, <i>улицу</i> и <i>номер дома</i> (Например: <i>Минск, ул. Карла Маркса 38</i>) или отправьте нужную геопозицию с нужной точкой на карте. В ответ я отдам всех известных стукачей вокруг этой точки которых слили.');
});

// Help command
bot.command('help', (ctx) => {
  return ctx.replyWithHTML('Просто введите адрес указав <i>населенный пункт</i>, <i>улицу</i> и <i>номер дома</i> (Например: <i>Минск, ул. Карла Маркса 38</i>) или отправьте геопозицию с нужной точкой на карте. В ответ я отдам всех известных стукачей вокруг этой точки. Если номера дома не будет - я примерно дерну стукачей по адресу который смогу разобрать. Ну и если захотите - могу отдать готовые листовки на этих субчиков...');
});

bot.action(/(?<=Посмотреть у соседей \()([a-z0-9]{5})(?=\))/, async (ctx) => {
  const geohashParent = ctx.match[0];
  dData = await db.all(`SELECT blackmapId, lat, lng, fullname, address, phone, denunciation, denunciationDate,
      denunciationLocation FROM denunciations WHERE geohashParent = ? AND denunciation IS NOT NULL 
      AND denunciationDate IS NOT NULL AND fullname IS NOT NULL`, [geohashParent]);
  if (!dData || dData.length === 0) {
    return ctx.reply('То ли киберпартизаны не все у них стырили, то ли Вы - счастливый человек и доносчиков рядом нет! :) Ничего не нашел у соседей тоже.');
  }
  ctx.reply(simplur`У соседей нашел все же ${dData.length} стукач[а|ей]! Вывожу!`);
  return renderCards(ctx, dData);
});

bot.on('location', async (ctx, next) => {
  const { message: { location: { latitude, longitude } = { latitude: 1, longitude: 1 } } = { location: {} } } = ctx.update;
  let geohash;
  let geohashParent;
  try {
    geohash = Geohash.encode(latitude, longitude, 6);
    geohashParent = geohash.slice(0, -1);
  } catch (e) {}
  return renderAnswers(ctx, geohash, geohashParent, `Координаты ${latitude}, ${longitude}`);
});

// Check link
bot.on('text', async (ctx, next) => {
  const { message } = ctx.update || { message: { text: '' } };
  const { text } = message;
  const normalizedText = !text ? null : text.trim();
  if (normalizedText === null || normalizedText.length <= 5) {
    return ctx.reply('Слишком короткий адрес');
  }
  const cache = await db.get(`SELECT formattedAddress, lat, lng FROM geocodes WHERE normAddress = ?`, [normalizedText]);
  let geohash;
  let geohashParent;
  let formattedAddress;
  if (cache) {
    const { formattedAddress: fa, lat, lng } = cache;
    formattedAddress = fa;
    geohash = Geohash.encode(lat, lng, 6);
    geohashParent = geohash.slice(0, -1);
  } else {
    let geocodeData;
    try {
      geocodeData = await googleMaps.geocode({
        params: {
          address: normalizedText,
          key: process.env.GOOGLE_MAPS_API_KEY,
          language: 'ru-RU',
          components: {
            country: 'BY',
          },
        },
        timeout: 3000
      });
    } catch (e) {}
    const { data: { results: [ geocodeResult = {} ] = []} = { results: [] } } = geocodeData;
    const { formattedAddress: fa = '', geometry: { location: { lat, lng } = {} } = {}} = geocodeResult;
    if (lat && lng) {
      formattedAddress = fa;
      geohash = Geohash.encode(lat, lng, 6);
      geohashParent = geohash.slice(0, -1);
      await db.run(`INSERT OR IGNORE INTO geocodes (normAddress, formattedAddress, lat, lng) VALUES (?, ?, ?, ?)`, [normalizedText, formattedAddress, lat, lng]);
    }
  }
  if (!geohash) {
    return ctx.reply('Что то пошло не так и не удалось получить координаты.');
  }
  return renderAnswers(ctx, geohash, geohashParent, formattedAddress);
});

const renderAnswers = async (ctx, geohash = 'aaaaaa', geohashParent = 'aaaaa', formattedAddress = '') => {
  let dData = await db.all(`SELECT blackmapId, lat, lng, fullname, address, phone, denunciation, denunciationDate,
      denunciationLocation FROM denunciations WHERE geohash = ? AND denunciation IS NOT NULL
      AND denunciationDate IS NOT NULL AND fullname IS NOT NULL`, [geohash]);
  if (!dData || dData.length === 0) {
    return ctx.replyWithHTML(
      `В районе <i>${formattedAddress}</i> данных по стукачам не нашлось. Попробую посмотреть стукачей в соседних районах? Ну или введите новый адрес.`,
      Markup.inlineKeyboard([
        Markup.button.callback('Посмотреть у соседей', `Посмотреть у соседей (${geohashParent})`)
      ])
    );
  }
  await ctx.replyWithHTML(simplur`В районе <i>${formattedAddress}</i> обнаружены данные ${dData.length} стукач[а|ей]. Вывожу!`);
  return renderCards(ctx, dData);
}

const renderCards = async (ctx, data) => {
  let count = 0;
  if (data.length > 0) {
    // noinspection ES6MissingAwait
    ctx.replyWithChatAction('find_location');
  }
  await sleep(5);
  for (let { blackmapId, lat, lng, fullname, address, phone, denunciation, denunciationDate, denunciationLocation } of data) {
    count++;
    const pdfPath = `./pdf/${blackmapId}.pdf`;
    let pdfExits = false;
    try {
      pdfExits = fs.existsSync(pdfPath);
    } catch (e) {}
    await ctx.replyWithHTML(`<b>${count}</b>: ${fullname}
<b>Адрес доносчика:</b> ${address}
<b>Телефон:</b> ${phone}
<b>Донос:</b> ${denunciation}
<b>Место:</b> ${denunciationLocation}
<b>Дата доноса:</b> ${denunciationDate}
${pdfExits ? 'Есть листовка, сейчас отдам!' : ''}`, { disable_notification: true });
    if (pdfExits) {
      const filename = cyrillicToTranslit().transform(`${fullname.toLowerCase()}.pdf`, '-');
      await ctx.replyWithDocument({source: pdfPath, filename, disable_notification: true});
    }
    await ctx.replyWithLocation(lat, lng, { disable_notification: true });
  }
  await sleep(5);
  return ctx.replyWithHTML(simplur`Итого обнаружены данные <b>${data.length}</b> стукач[а|ей]. А завтра будут еще и листовки на них!`, { disable_notification: true });
}

const useTelegram = async () => {
  const check = 0;
  // eslint-disable-next-line no-unmodified-loop-condition
  while (!botServerUrl) {
    await new Promise(resolve => {
      if (check < 30) {
        setTimeout(resolve, 1000);
      } else {
        console.log('Timeout for initialization of server url');
        process.exit(1);
      }
    });
  }
  console.log(`Run bot on port ${process.env.PORT} and with hook on ${botServerUrl}/${endpoint}`);
  return bot.webhookCallback(`/${endpoint}`)
};

module.exports = useTelegram;
