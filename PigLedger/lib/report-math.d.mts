export type ReportExpenseInput = { date: string; lineTotal: number };
export type ReportSaleInput = { id: string; date: string; gross: number };
export type ReportPaymentInput = { saleId: string; paymentDate: string; amount: number };
export function calculateReportFinancials(input: {
  expenses?: ReportExpenseInput[];
  sales?: ReportSaleInput[];
  payments?: ReportPaymentInput[];
  dateFrom?: string;
  dateTo?: string;
}): {
  periodExpenses: ReportExpenseInput[];
  periodSales: ReportSaleInput[];
  periodPayments: ReportPaymentInput[];
  salesRevenue: number;
  totalCosts: number;
  cashReceived: number;
  receivables: number;
  netProfit: number;
};
export function groupDailyCashflow(
  expenses?: ReportExpenseInput[],
  sales?: ReportSaleInput[],
  dateFrom?: string,
  dateTo?: string
): Array<{date:string; revenue:number; expenses:number}>;
