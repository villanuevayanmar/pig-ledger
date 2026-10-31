export type SaleBalanceInput = { id: string; gross: number };
export type SalePaymentInput = { saleId: string; amount: number };
export type SaleBalanceStatus = 'unpaid' | 'part-paid' | 'paid' | 'overpaid';
export type SaleBalanceRow = {
  saleId: string; gross: number; paid: number; balance: number;
  overpaid: boolean; status: SaleBalanceStatus;
};
export function calculateSaleBalances(
  sales?: SaleBalanceInput[],
  payments?: SalePaymentInput[]
): {
  rows: SaleBalanceRow[];
  salesRevenue: number;
  cashReceived: number;
  outstanding: number;
  overpaidAmount: number;
};
