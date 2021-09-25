const sqlite3 = require('sqlite3').verbose();

const DBPATH = `./db/${process.env.SQLITEDB}`;

const db = new sqlite3.Database(DBPATH, (err) => {
  if (err) {
    console.error(`DB error: ${err.message}`);
  }
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) {
      console.error(`Error running sql: ${sql}`);
      console.error(err.message);
      reject();
    } else {
      resolve({ id: this.lastID ? this.lastID : null });
    }
  })
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) {
      console.error(`Error running sql: ${sql}`);
      console.error(err.message);
      reject();
    }
    resolve(row);
  });
});

const all = (sql, params = []) => new Promise(async (resolve, reject) => {
  await db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(`Error running sql: ${sql}`);
      console.error(err.message);
      reject();
    }
    resolve(rows);
  });
});

module.exports = {
  run, get, all
};