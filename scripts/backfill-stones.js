/* One-off: move the single-stone scalars on StockItem into the new Stone child table.
 * Idempotent — skips any item that already has child rows. Clears the descriptive scalars it
 * copied (NOT diamondCertNo/diamondCertLab, which stay as the live cert snapshot). */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

;(async () => {
  const items = await db.stockItem.findMany({
    where: {
      OR: [
        { stoneName: { not: null } },
        { stoneClarity: { not: null } },
        { stoneColorGrade: { not: null } },
        { stoneShape: { not: null } },
        { stoneSize: { not: null } },
        { stoneGrossWeightCt: { not: null } },
        { stoneRateCt: { not: null } },
      ],
    },
    include: { stones: true },
  })
  console.log('candidates:', items.length)

  let moved = 0
  for (const it of items) {
    if (it.stones.length) { console.log('skip (already has stones):', it.itemCode || it.id); continue }
    await db.$transaction(async (tx) => {
      await tx.stone.create({
        data: {
          firmId: it.firmId, stockItemId: it.id, seq: 0,
          name: it.stoneName, clarity: it.stoneClarity, colorGrade: it.stoneColorGrade,
          shape: it.stoneShape, size: it.stoneSize, otherInfo: it.stoneOtherInfo,
          // Cert lives on the item and is the snapshot of the first certified stone — copied
          // down onto the row it came from so the row is self-describing.
          certNo: it.diamondCertNo, certLab: it.diamondCertLab,
          qty: it.stoneQty, caratWeight: it.stoneGrossWeightCt,
          rateCt: it.stoneRateCt, sellRateCt: it.stoneSellRateCt,
          amount: round2((it.stoneGrossWeightCt || 0) * (it.stoneRateCt || 0)) || null,
        },
      })
      await tx.stockItem.update({
        where: { id: it.id },
        data: {
          stoneId: null, stoneName: null, stoneClarity: null, stoneColorGrade: null,
          stoneShape: null, stoneSize: null, stoneOtherInfo: null, stoneQty: null,
          stoneGrossWeightCt: null, stoneRateCt: null, stoneSellRateCt: null,
        },
      })
    })
    moved++
    console.log('moved:', it.itemCode || it.id, '->', it.stoneName || '(unnamed stone)')
  }
  console.log('done. moved', moved, 'item(s)')
  console.log('stone rows now:', await db.stone.count())
  await db.$disconnect()
})()
