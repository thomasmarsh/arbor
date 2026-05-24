// Oracle (oracledb) is excluded from package.json because it requires
// platform-specific native binaries and Oracle Instant Client.
//
// To enable:
//   1. Install Oracle Instant Client for your platform / container base image
//   2. pnpm add oracledb @types/oracledb --filter @arbo/api
//   3. Uncomment the block below
//
// See: https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html

// import oracledb from 'oracledb';
//
// // Use Thin mode (no Instant Client required for basic use in Node >= 18):
// // oracledb.initOracleClient(); // remove this line if using Thin mode
//
// export async function getOracleConnection(): Promise<oracledb.Connection> {
//   return oracledb.getConnection({
//     user:          process.env.ARBO_ORACLE_USER,
//     password:      process.env.ARBO_ORACLE_PASSWORD,
//     connectString: process.env.ARBO_ORACLE_CONNECT_STRING,
//   });
// }
//
// export async function withOracleConnection<T>(
//   fn: (conn: oracledb.Connection) => Promise<T>,
// ): Promise<T> {
//   const conn = await getOracleConnection();
//   try {
//     return await fn(conn);
//   } finally {
//     await conn.close();
//   }
// }

export const oracle = {} as const; // placeholder until oracledb is enabled
