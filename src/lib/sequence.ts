import { prisma, type Tx } from "./db";

/** Sinh mã tăng dần an toàn khi chạy đồng thời (UPDATE ... SET value = value + 1 là nguyên tử) */
export async function nextSequence(name: string, tx: Tx = prisma): Promise<number> {
  const row = await tx.sequence.upsert({
    where: { name },
    create: { name, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

export async function nextEmployeeCode(tx: Tx = prisma): Promise<string> {
  for (let i = 0; i < 1000; i++) {
    const code = "NV" + String(await nextSequence("employee", tx)).padStart(4, "0");
    const exists = await tx.employee.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Không sinh được mã nhân viên");
}

export async function nextCode(name: string, prefix: string, pad = 4, tx: Tx = prisma): Promise<string> {
  return prefix + String(await nextSequence(name, tx)).padStart(pad, "0");
}
