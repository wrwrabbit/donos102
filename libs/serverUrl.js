let localtunnel;
let url = process.env.SERVER_URL.replace(/\/$/, '');
if(process.env.NODE_ENV !== 'production') {
  localtunnel = require('localtunnel');
}

(async () => {
  if(process.env.NODE_ENV !== 'production') {
    const check = 0;
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!localtunnel) {
      await new Promise(resolve => {
        if (check < 30) {
          setTimeout(resolve, 1000);
        } else {
          console.error('Timeout for localtunnel initialization');
          process.exit(1);
        }
      });
    }
    const tunnel = await localtunnel({ port: process.env.PORT });
    console.log(`Developer mode detected. Localtunnel initialization on ${tunnel.url}`);
    url = tunnel.url.replace(/\/$/, '');
  } else {
    console.log(`Production mode detected. Initialization on ${url}`);
  }
})();

module.exports = async () => {
  const prodUrl = process.env.SERVER_URL.replace(/\/$/, '');
  if(process.env.NODE_ENV === 'production') {
    return prodUrl;
  }
  const check = 0;
  // eslint-disable-next-line no-unmodified-loop-condition
  while (url === prodUrl) {
    await new Promise(resolve => {
      if (check < 45) {
        setTimeout(resolve, 1000);
      } else {
        console.error('Timeout for localtunnel url generation');
        process.exit(1);
      }
    });
  }
  return url;
};