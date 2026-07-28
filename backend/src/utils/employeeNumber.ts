import type { Prisma } from "@prisma/client";

/**
 * Следующий порядковый номер сотрудника в компании (внутри транзакции).
 */
export async function nextEmployeeNumberForCompany(
  tx: Prisma.TransactionClient,
  companyId: string
): Promise<number> {
  const agg = await tx.user.aggregate({
    where: { companyId },
    _max: { employeeNumber: true },
  });
  return (agg._max.employeeNumber ?? 0) + 1;
}
