// Only known infrastructure codes are useful in operational logs. Never copy an
// arbitrary Error.code, message, detail, SQL, connection URL or provider body.
const safeCodes = new Set([
  // Static internal configuration code: no variable name or value is logged.
  'DB_NOT_CONFIGURED',
  // PostgreSQL SQLSTATEs used for connectivity, authentication, schema, integrity,
  // transaction, resource and server failures. Unknown codes stay unlogged.
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
  '22001', '22003', '22007', '22008', '22012', '22023', '22P02',
  '23502', '23503', '23505', '23514', '25000', '25006', '25P02',
  '28000', '28P01', '3D000', '3F000', '40001', '40P01',
  '42501', '42601', '42703', '42704', '42804', '42883', '42P01',
  '53000', '53100', '53200', '53300', '53400', '55000', '55P03',
  '57000', '57014', '57P01', '57P02', '57P03', '58000', '58030',
  '58P01', '58P02', 'XX000', 'XX001', 'XX002',
  // Node network and TLS codes. A certificate failure remains a failure;
  // diagnostic logging never changes certificate verification or DB settings.
  'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN',
  'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPROTO',
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_SIGNATURE_FAILURE', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_TLS_HANDSHAKE_TIMEOUT', 'ERR_SSL_WRONG_VERSION_NUMBER'
]);

export function errorDiagnosticCode(error: unknown): string | undefined {
  let current = error;
  // Handle a few native Error.cause wrappers without serializing their contents.
  for (let depth = 0; depth < 3; depth++) {
    if (!current || typeof current !== 'object') return undefined;
    let code: unknown, cause: unknown;
    try { ({ code, cause } = current as { code?: unknown; cause?: unknown }); }
    catch { return undefined; }
    if (typeof code === 'string' && safeCodes.has(code)) return code;
    current = cause;
  }
  return undefined;
}
