import "server-only";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getJwt() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }
  return new JWT({ email, key, scopes: SCOPES });
}

export interface ExportRow {
  date: string;
  leg: "morning" | "evening";
  route: string;
  driver_share: number;
  gas_price: number;
  parking: number;
  toll: number;
  passenger_shares: Record<string, number>;
}

export async function appendRows(
  sheetTabName: string,
  rows: ExportRow[],
  passengerNames: string[]
) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");

  const doc = new GoogleSpreadsheet(sheetId, getJwt());
  await doc.loadInfo();

  let sheet = doc.sheetsByTitle[sheetTabName];
  const header = [
    "date",
    "leg",
    "route",
    "gas_price",
    "parking",
    "toll",
    "driver_share",
    ...passengerNames,
  ];
  if (!sheet) {
    sheet = await doc.addSheet({ title: sheetTabName, headerValues: header });
  } else {
    await sheet.setHeaderRow(header);
  }

  const flat = rows.map((r) => ({
    date: r.date,
    leg: r.leg,
    route: r.route,
    gas_price: r.gas_price,
    parking: r.parking,
    toll: r.toll,
    driver_share: r.driver_share,
    ...Object.fromEntries(passengerNames.map((n) => [n, r.passenger_shares[n] ?? 0])),
  }));

  await sheet.addRows(flat);
  return flat.length;
}

export async function replaceRows(
  sheetTabName: string,
  headers: string[],
  rows: Record<string, string | number | boolean | null>[]
) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");

  const doc = new GoogleSpreadsheet(sheetId, getJwt());
  await doc.loadInfo();

  let sheet = doc.sheetsByTitle[sheetTabName];
  if (!sheet) {
    sheet = await doc.addSheet({ title: sheetTabName, headerValues: headers });
  } else {
    await sheet.clear();
    await sheet.setHeaderRow(headers);
  }
  if (rows.length > 0) {
    // google-spreadsheet's addRows expects string-keyed records; coerce nulls to "".
    const normalized = rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, v === null ? "" : (v as string | number | boolean)])
      )
    );
    await sheet.addRows(normalized);
  }
  return rows.length;
}
