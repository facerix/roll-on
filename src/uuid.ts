// uuid.ts -- tools for generating & working with UUIDs
//
// Thin wrapper over the platform `crypto.randomUUID()` API (Baseline since
// 2022; supported in all modern browsers and Node 19+). The module exists so
// that `v4WithTimestamp()` — which overwrites the first hex word with the
// current time so records sort roughly chronologically by id — has a home.

const getCurrTimestampAsHex = (): string => {
  return new Date().getTime().toString(16).slice(0, 8);
};

export const v4 = (): string => {
  return crypto.randomUUID();
};

/*
There are several variations of timestamp-first UUIDs in different implementations because
there is not agreed upon specification. However, generally the first 8 hex digits represent
the time and the remaining digits are random.
– https://www.uuidtools.com/uuid-versions-explained#timestamp-first
*/

export const v4WithTimestamp = (): string => {
  // crypto.randomUUID() returns "xxxxxxxx-xxxx-4xxx-Nxxx-xxxxxxxxxxxx".
  // Replace the leading 8 hex chars with the current epoch-ms hex so ids
  // sort approximately by creation time.
  return `${getCurrTimestampAsHex()}${crypto.randomUUID().slice(8)}`;
};
