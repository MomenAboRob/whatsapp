import type { InboxCard, InboxReceipt } from './transfer-inbox';

type AmountSummary = {
  count: number;
  unknownAmountCount: number;
  amounts: { currency: string; amount: number }[];
};

export function isPendingInboxCard(card: InboxCard): boolean {
  return (card.status === 'new' || card.status === 'review') && !card.portalUploaded && !card.airtableSaved;
}

export function summarizePendingInbox(cards: InboxCard[], receipts: InboxReceipt[]): {
  all: AmountSummary;
  withReceipt: AmountSummary;
  withoutReceipt: AmountSummary;
} {
  const receiptImages = new Map(receipts.map((receipt) => [receipt.id, receipt.mediaUrl]));
  const buckets = {
    all: { count: 0, unknownAmountCount: 0, amounts: new Map<string, number>() },
    withReceipt: { count: 0, unknownAmountCount: 0, amounts: new Map<string, number>() },
    withoutReceipt: { count: 0, unknownAmountCount: 0, amounts: new Map<string, number>() },
  };

  for (const card of cards) {
    if (!isPendingInboxCard(card)) continue;
    const hasReceiptImage = Boolean(
      (card.embeddedMediaUrl && /\.(?:jpe?g|png|webp|gif|heic)(?:\?|$)/i.test(card.embeddedMediaUrl))
      || (card.receiptMessageId && receiptImages.get(card.receiptMessageId)),
    );
    const selected = hasReceiptImage ? buckets.withReceipt : buckets.withoutReceipt;
    for (const bucket of [buckets.all, selected]) {
      bucket.count++;
      if (card.amount == null || !Number.isFinite(card.amount)) {
        bucket.unknownAmountCount++;
        continue;
      }
      const currency = card.currency || 'JOD';
      bucket.amounts.set(currency, (bucket.amounts.get(currency) || 0) + Math.round(card.amount * 1000));
    }
  }

  const finish = (bucket: typeof buckets.all): AmountSummary => ({
    count: bucket.count,
    unknownAmountCount: bucket.unknownAmountCount,
    amounts: [...bucket.amounts].sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: amount / 1000 })),
  });
  return {
    all: finish(buckets.all),
    withReceipt: finish(buckets.withReceipt),
    withoutReceipt: finish(buckets.withoutReceipt),
  };
}
