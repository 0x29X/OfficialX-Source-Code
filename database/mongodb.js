const { Worker, isMainThread, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MongoClient } = require('mongodb');

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

if (isMainThread) {
  const worker = new Worker(__filename);

  let resolveReady, rejectReady;
  const ready = new Promise((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });

  worker.on('message', (msg) => {
    if (msg.type === 'ready') resolveReady();
    if (msg.type === 'error') rejectReady(new Error(msg.error));
  });

  function wait(sql, params) {
    const sab = new SharedArrayBuffer(4);
    const view = new Int32Array(sab);
    const resultFile = path.join(os.tmpdir(), 'mongo_res_' + Date.now() + '_' + Math.random() + '.json');

    worker.postMessage({ type: 'query', sab, sql, params, resultFile });

    Atomics.wait(view, 0, 0);

    try {
      const raw = fs.readFileSync(resultFile, 'utf8');
      fs.unlinkSync(resultFile);
      const data = JSON.parse(raw);
      if (data.error) {
        console.error('MongoDB worker error:', data.error);
        return null;
      }
      return data.result !== undefined ? data.result : null;
    } catch (e) {
      return null;
    }
  }

  function buildStatement(sql) {
    const normalized = normalizeSql(sql);
    return {
      run(...params) { return wait(normalized, params); },
      get(...params) {
        const res = wait(normalized, params);
        return Array.isArray(res) ? res[0] : res;
      },
      all(...params) { return wait(normalized, params); }
    };
  }

  function exec(sql) { return true; }

  const db = {
    ready,
    prepare(sql) { return buildStatement(sql); },
    exec,
    close() { worker.terminate(); }
  };

  module.exports = db;

} else {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('[FATAL] MONGO_URI is not defined in .env file!');
    process.exit(1);
  }
  const DB_NAME = process.env.MONGO_DB_NAME || 'OfficialX';

  let client;
  let database;
  let isConnecting = false;

  async function connectWithRetry() {
    if (isConnecting) return;
    isConnecting = true;

    try {
      if (client) {
        await client.close().catch(() => { });
        client = null;
      }

      console.log('[!] Connecting to Database...');
      client = new MongoClient(MONGO_URI, {
        connectTimeoutMS: 60000,
        socketTimeoutMS: 60000,
        serverSelectionTimeoutMS: 60000,
        family: 4
      });

      await client.connect();
      database = client.db(DB_NAME);

      const collections = [
        { name: 'server_config', key: { guild_id: 1 }, options: { unique: true } },
        { name: 'whitelists', key: { guild_id: 1, user_id: 1 }, options: { unique: true } },
        { name: 'whitelist_roles', key: { guild_id: 1, role_id: 1 }, options: { unique: true } },
        { name: 'backups', key: { backup_id: 1 }, options: { unique: true } },
        { name: 'afk_users', key: { guild_id: 1, user_id: 1 }, options: { unique: true } },
        { name: 'guild_registry', key: { guild_id: 1 }, options: { unique: true } },
        { name: 'magic_users', key: { user_id: 1 }, options: { unique: true } },
        { name: 'moderation_logs', key: { guild_id: 1, user_id: 1 } },
        { name: 'allowances', key: { guild_id: 1, target_id: 1, action: 1 }, options: { unique: true } }
      ];

      const indexPromises = collections.map(collection =>
        database.collection(collection.name).createIndex(collection.key, collection.options || {}).catch(() => { })
      );

      console.log('[+] Connected to Database:', DB_NAME);
      parentPort.postMessage({ type: 'ready' });
      isConnecting = false;

      await Promise.all(indexPromises);
      console.log('[!] All Database indexes verified');

      client.on('error', (err) => {
        if (err.message.includes('ECONNRESET')) {
          console.error('Database connection lost, reconnecting...');
          connectWithRetry();
        }
      });

    } catch (error) {
      isConnecting = false;
      console.error('Database connection failed, retrying in 5s...', error.message);
      setTimeout(connectWithRetry, 5000);
    }
  }

  connectWithRetry();


  function parseSqlValue(token, params, nextIndex) {
    if (token === '?') {
      return params[nextIndex()];
    }

    const literal = token.trim();

    if (/^'.*'$/.test(literal)) {
      return literal.slice(1, -1).replace(/''/g, "'");
    }

    if (/^-?\d+$/.test(literal)) {
      return Number(literal);
    }

    if (/^-?\d+\.\d+$/.test(literal)) {
      return Number(literal);
    }

    return literal;
  }

  function parseAssignments(assignments, params, startIndex = 0) {
    const values = {};
    let index = startIndex;

    const parts = assignments.split(',').map(part => part.trim()).filter(Boolean);
    for (const part of parts) {
      const [field, rawValue] = part.split('=').map(x => x.trim());
      if (!field || rawValue === undefined) continue;
      values[field] = parseSqlValue(rawValue, params, () => index++);
    }

    return { values, nextIndex: index };
  }

  function parseWhereClause(where, params, startIndex = 0) {
    const filter = {};
    let index = startIndex;

    const clauses = where.split(/\s+AND\s+/i).map(part => part.trim()).filter(Boolean);
    for (const clause of clauses) {
      const [field, rawValue] = clause.split('=').map(x => x.trim());
      if (!field || rawValue === undefined) continue;
      filter[field] = parseSqlValue(rawValue, params, () => index++);
    }

    return { filter, nextIndex: index };
  }

  function getCollection(name) {
    return database.collection(name);
  }

  async function executeQuery(normalized, params) {
    const upper = normalized.toUpperCase();

    if (upper.startsWith('INSERT OR IGNORE INTO SERVER_CONFIG')) {
      const guildId = params[0];
      return getCollection('server_config').updateOne(
        { guild_id: guildId },
        { $setOnInsert: { guild_id: guildId } },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT OR IGNORE INTO WHITELISTS')) {
      const [guildId, userId, level] = params;
      return getCollection('whitelists').updateOne(
        { guild_id: guildId, user_id: userId },
        { $setOnInsert: { guild_id: guildId, user_id: userId, level } },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT OR REPLACE INTO WHITELISTS')) {
      const [guildId, userId, level] = params;
      return getCollection('whitelists').replaceOne(
        { guild_id: guildId, user_id: userId },
        { guild_id: guildId, user_id: userId, level },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT OR IGNORE INTO WHITELIST_ROLES')) {
      const [guildId, roleId, level] = params;
      return getCollection('whitelist_roles').updateOne(
        { guild_id: guildId, role_id: roleId },
        { $setOnInsert: { guild_id: guildId, role_id: roleId, level: level || 'admin' } },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT OR REPLACE INTO WHITELIST_ROLES')) {
      const [guildId, roleId, level] = params;
      return getCollection('whitelist_roles').replaceOne(
        { guild_id: guildId, role_id: roleId },
        { guild_id: guildId, role_id: roleId, level: level || 'admin' },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT OR REPLACE INTO BACKUPS')) {
      const [backupId, guildId, data, createdAt] = params;
      return getCollection('backups').replaceOne(
        { backup_id: backupId },
        { backup_id: backupId, guild_id: guildId, data, created_at: createdAt },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT OR REPLACE INTO AFK_USERS')) {
      const [guildId, userId, reason, timestamp] = params;
      return getCollection('afk_users').replaceOne(
        { guild_id: guildId, user_id: userId },
        { guild_id: guildId, user_id: userId, reason, timestamp },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT INTO MODERATION_LOGS')) {
      const [guildId, userId, action, reason, timestamp] = params;
      return getCollection('moderation_logs').insertOne({ guild_id: guildId, user_id: userId, action, reason, timestamp });
    }

    if (upper.startsWith('INSERT OR IGNORE INTO ALLOWANCES')) {
      const [guildId, targetId, action] = params;
      return getCollection('allowances').updateOne(
        { guild_id: guildId, target_id: targetId, action },
        { $setOnInsert: { guild_id: guildId, target_id: targetId, action } },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT OR REPLACE INTO MAGIC_USERS')) {
      const userId = params[0];
      return getCollection('magic_users').replaceOne(
        { user_id: userId },
        { user_id: userId },
        { upsert: true }
      );
    }

    if (upper.startsWith('INSERT OR IGNORE INTO MAGIC_USERS')) {
      const userId = params[0];
      return getCollection('magic_users').updateOne({ user_id: userId }, { $setOnInsert: { user_id: userId, expires_at: null } }, { upsert: true });
    }

    if (upper.startsWith('INSERT INTO GUILD_REGISTRY')) {
      const [guildId, guildName, memberCount, ownerId, joinedAt] = params;
      return getCollection('guild_registry').updateOne(
        { guild_id: guildId },
        {
          $set: {
            guild_name: guildName,
            member_count: memberCount,
            owner_id: ownerId,
            left_at: null,
            active: 1
          },
          $setOnInsert: {
            guild_id: guildId,
            joined_at: joinedAt
          }
        },
        { upsert: true }
      );
    }

    if (upper.startsWith('UPDATE SERVER_CONFIG')) {
      const setMatch = normalized.match(/SET (.+?) WHERE/i);
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!setMatch || !whereMatch) return null;

      let paramIndex = 0;
      const { values: setValues, nextIndex } = parseAssignments(setMatch[1], params, 0);
      paramIndex = nextIndex;
      const { filter } = parseWhereClause(whereMatch[1], params, paramIndex);

      return getCollection('server_config').updateOne(filter, { $set: setValues }, { upsert: true });
    }

    if (upper.startsWith('UPDATE GUILD_REGISTRY')) {
      const setMatch = normalized.match(/SET (.+?) WHERE/i);
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!setMatch || !whereMatch) return null;

      let paramIndex = 0;
      const { values: setValues, nextIndex } = parseAssignments(setMatch[1], params, 0);
      paramIndex = nextIndex;
      const { filter } = parseWhereClause(whereMatch[1], params, paramIndex);

      return getCollection('guild_registry').updateOne(filter, { $set: setValues });
    }

    if (upper.startsWith('DELETE FROM AFK_USERS') || upper.startsWith('DELETE FROM WHITELISTS') || upper.startsWith('DELETE FROM WHITELIST_ROLES') || upper.startsWith('DELETE FROM ALLOWANCES')) {
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!whereMatch) return null;
      const { filter } = parseWhereClause(whereMatch[1], params, 0);

      const collection = upper.includes('AFK_USERS')
        ? 'afk_users'
        : upper.includes('WHITELIST_ROLES')
          ? 'whitelist_roles'
          : upper.includes('ALLOWANCES')
            ? 'allowances'
            : 'whitelists';

      return getCollection(collection).deleteMany(filter);
    }

    if (upper.startsWith('DELETE FROM MAGIC_USERS')) {
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!whereMatch) {
        return getCollection('magic_users').deleteMany({});
      }
      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      return getCollection('magic_users').deleteMany(filter);
    }

    if (upper.startsWith('SELECT COUNT(*) AS COUNT FROM')) {
      const match = normalized.match(/FROM (.+?) WHERE (.+)$/i);
      if (!match) return { count: 0 };
      const collectionName = match[1].trim();
      const { filter } = parseWhereClause(match[2], params, 0);
      const count = getCollection(collectionName).countDocuments(filter);
      return count.then(value => ({ count: value }));
    }

    if (upper.startsWith('SELECT 1 FROM')) {
      const match = normalized.match(/FROM (.+?) WHERE (.+)$/i);
      if (!match) return null;
      const collectionName = match[1].trim();
      const { filter } = parseWhereClause(match[2], params, 0);
      return getCollection(collectionName).findOne(filter, { projection: { _id: 0 } });
    }

    if (upper.startsWith('SELECT ') && upper.includes('FROM SERVER_CONFIG')) {
      const fieldsMatch = normalized.match(/SELECT (.+?) FROM SERVER_CONFIG/i);
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!fieldsMatch) return null;

      const rawFields = fieldsMatch[1].trim();
      const projection = rawFields === '*' ? {} : rawFields.split(',').reduce((proj, field) => {
        const key = field.trim();
        if (key) proj[key] = 1;
        return proj;
      }, {});

      if (!whereMatch) {
        return getCollection('server_config').find({}, { projection }).toArray();
      }

      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      return getCollection('server_config').findOne(filter, { projection });
    }

    if (upper.startsWith('SELECT ') && upper.includes('FROM BACKUPS')) {
      const whereMatch = normalized.match(/WHERE (.+?)(?: ORDER BY|$)/i);
      if (!whereMatch) return null;

      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      const collection = getCollection('backups');

      if (upper.includes('ORDER BY')) {
        const limitMatch = normalized.match(/LIMIT (\d+)/i);
        const limit = limitMatch ? parseInt(limitMatch[1], 10) : 0;
        const cursor = collection.find(filter).sort({ created_at: -1 });
        if (limit > 0) cursor.limit(limit);

        const results = await cursor.toArray();
        return (limit === 1) ? (results[0] || null) : results;
      }

      return collection.findOne(filter);
    }

    if (upper.startsWith('SELECT LOG_CHANNEL FROM SERVER_CONFIG') || upper.startsWith('SELECT ANTI_NUKER FROM SERVER_CONFIG') || upper.startsWith('SELECT ANTI_SELFBOT') || upper.startsWith('SELECT RAID_PREVENTION') || upper.startsWith('SELECT PREFIX') || upper.startsWith('SELECT ENABLED') || upper.startsWith('SELECT VERIFICATION_ROLE')) {
      const fieldsMatch = normalized.match(/SELECT (.+?) FROM SERVER_CONFIG/i);
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!fieldsMatch || !whereMatch) return null;
      const projection = fieldsMatch[1].split(',').reduce((proj, field) => {
        const key = field.trim();
        if (key) proj[key] = 1;
        return proj;
      }, {});
      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      return getCollection('server_config').findOne(filter, { projection });
    }

    if (upper.startsWith('DELETE FROM AFK_USERS')) {
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!whereMatch) return null;
      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      return getCollection('afk_users').deleteMany(filter);
    }

    if (upper.startsWith('SELECT ') && (upper.includes('FROM WHITELISTS') || upper.includes('FROM WHITELIST_ROLES') || upper.includes('FROM MAGIC_USERS') || upper.includes('FROM ALLOWANCES'))) {
      const collectionName = upper.includes('WHITELIST_ROLES') ? 'whitelist_roles' : upper.includes('MAGIC_USERS') ? 'magic_users' : upper.includes('ALLOWANCES') ? 'allowances' : 'whitelists';
      const fieldsMatch = normalized.match(/SELECT (.+?) FROM/i);
      const whereMatch = normalized.match(/WHERE (.+)$/i);

      const projection = fieldsMatch && fieldsMatch[1].trim() !== '*' ? fieldsMatch[1].split(',').reduce((proj, field) => {
        const key = field.trim().toLowerCase();
        if (key) proj[key] = 1;
        return proj;
      }, {}) : {};

      if (!whereMatch) {
        return getCollection(collectionName).find({}, { projection }).toArray();
      }
      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      const results = getCollection(collectionName).find(filter, { projection }).toArray();

      if (upper.startsWith('SELECT LEVEL FROM WHITELISTS') || upper.startsWith('SELECT 1 FROM') || upper.startsWith('SELECT EXPIRES_AT FROM MAGIC_USERS')) {
        return results.then(arr => arr[0] || null);
      }
      return results;
    }

    if (upper.includes('FROM AFK_USERS')) {
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!whereMatch) return getCollection('afk_users').find({}).toArray();
      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      return getCollection('afk_users').findOne(filter);
    }

    if (upper.startsWith('SELECT COUNT(*) AS TOTAL FROM MODERATION_LOGS') || upper.startsWith('SELECT COUNT(*) AS COUNT FROM')) {
      const match = normalized.match(/FROM (.+?)(?:\s+WHERE\s+(.+))?$/i);
      if (!match) return { count: 0, total: 0 };
      const collectionName = match[1].trim().toLowerCase();
      const isTotal = upper.includes('AS TOTAL');

      if (match[2]) {
        const { filter } = parseWhereClause(match[2], params, 0);
        const count = getCollection(collectionName).countDocuments(filter);
        return count.then(value => isTotal ? { total: value } : { count: value });
      } else {
        const count = getCollection(collectionName).countDocuments({});
        return count.then(value => isTotal ? { total: value } : { count: value });
      }
    }

    if (upper.startsWith('SELECT * FROM MODERATION_LOGS') && upper.includes('ORDER BY TIMESTAMP DESC')) {
      const whereMatch = normalized.match(/WHERE (.+?) ORDER BY/i);
      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      return getCollection('moderation_logs').find(filter).sort({ timestamp: -1 }).toArray();
    }

    if (upper.startsWith('SELECT REASON') && upper.includes('FROM AFK_USERS')) {
      const whereMatch = normalized.match(/WHERE (.+)$/i);
      if (!whereMatch) return null;
      const { filter } = parseWhereClause(whereMatch[1], params, 0);
      return getCollection('afk_users').findOne(filter, { projection: { reason: 1, timestamp: 1, _id: 0 } });
    }

    console.warn('MongoDB adapter could not handle SQL:', normalized);
    return null;
  }

  parentPort.on('message', async (msg) => {
    if (msg.type === 'query') {
      const { sab, sql, params, resultFile } = msg;
      const view = new Int32Array(sab);

      try {
        if (!database) {
          fs.writeFileSync(resultFile, JSON.stringify({ error: 'Database not connected' }));
        } else {
          let result = await executeQuery(sql, params);
          fs.writeFileSync(resultFile, JSON.stringify({ result }));
        }
      } catch (err) {
        fs.writeFileSync(resultFile, JSON.stringify({ error: err.message }));
      }

      Atomics.store(view, 0, 1);
      Atomics.notify(view, 0, 1);
    }
  });
}
