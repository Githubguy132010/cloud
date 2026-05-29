export function formatWantedItemMessage(params: {
  itemId: string;
  wastelandId: string;
  title: string;
  type?: string | null;
  priority?: string | number | null;
  description?: string | null;
}): string {
  return `Subject: Wasteland wanted item: ${params.title}

You have received a wanted item from the wasteland board.

Title: ${params.title}
Type: ${params.type ?? 'N/A'}
Priority: ${params.priority ?? 'N/A'}
Item ID: ${params.itemId}
Wasteland ID: ${params.wastelandId}

Description:
${params.description ?? 'No description provided'}

To claim and begin work, use gt_wasteland_claim with item_id: ${params.itemId}, then sling the appropriate beads with the wasteland_origin metadata tag set to "${params.wastelandId}".`;
}
