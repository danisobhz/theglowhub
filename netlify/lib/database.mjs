// The shared shop uses a small D1-style interface. Keep its SQL parameterized
// while executing it on Netlify's managed Postgres database.
export function postgresQuery(sql, values = []) {
  let index = 0;
  const text = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, match => match === '?' ? `$${++index}` : match);
  if (index !== values.length) throw new Error('SQL parameter count does not match.');
  return { text, values };
}

export function createDatabase(pool) {
  const prepare = sql => {
    let values = [];
    return {
      bind(...parameters) { values = parameters; return this; },
      query() { return postgresQuery(sql, values); },
      async first() { return (await pool.query(this.query())).rows[0] || null; },
      async run() { const result = await pool.query(this.query()); return { results: result.rows, success: true }; }
    };
  };
  return {
    prepare,
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const results = [];
        for (const statement of statements) {
          const result = await client.query(statement.query());
          results.push({ results: result.rows, success: true });
        }
        await client.query('COMMIT');
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }
  };
}
