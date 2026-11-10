import { connection } from "next/server"
import { loadRegisters, REGISTER_FOLDER, type RegisterStatus } from "@/lib/providers"

/** GET /api/register: which shareholder lists are saved, and whether each could be read. */
export async function GET() {
  // The folder is read at request time, never while building.
  await connection()
  const { version, registers, failed } = await loadRegisters()
  const status: RegisterStatus = {
    version,
    folder: REGISTER_FOLDER,
    registers: registers.map(({ date, file, rows }) => ({
      date,
      file,
      holders: rows.length,
      companies: new Set(rows.map((row) => row.code)).size,
    })),
    failed,
  }
  // Saving a new list has to show at once.
  return Response.json(status, { headers: { "Cache-Control": "no-store" } })
}
