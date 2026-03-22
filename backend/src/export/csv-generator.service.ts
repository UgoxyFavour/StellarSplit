import { Injectable } from "@nestjs/common";
import { ExportJob } from "./entities/export-job.entity";
import * as XLSX from "xlsx";

@Injectable()
export class CsvGeneratorService {
  async generateCsv(data: any, job: ExportJob): Promise<Buffer> {
    const rows = this.flattenDataToRows(data, job);
    const header = Object.keys(rows[0] ?? {}).join(",");
    const body = rows.map((row) =>
      Object.values(row)
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    return Buffer.from([header, ...body].join("\n"), "utf-8");
  }

  async generateXlsx(data: any, job: ExportJob): Promise<Buffer> {
    const rows = this.flattenDataToRows(data, job);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
    return Buffer.from(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    );
  }

  private flattenDataToRows(data: any, _job: ExportJob): Record<string, any>[] {
    // Monthly summary
    if (data.monthlyData) {
      return data.monthlyData.map((m: any) => ({
        month: m.month,
        expense_count: m.expenseCount,
        total_amount: m.totalAmount,
        settlements: m.settlements,
        settlement_amount: m.settlementAmount,
      }));
    }

    // Category breakdown
    if (data.categories) {
      return data.categories.map((c: any) => ({
        category: c.category,
        total_amount: c.totalAmount,
        expense_count: c.expenseCount,
        average_amount: c.averageAmount.toFixed(2),
        percentage: c.percentage.toFixed(2),
      }));
    }

    // Partner summary
    if (data.partners) {
      return data.partners.map((p: any) => ({
        partner_name: p.partnerName,
        owed_to_you: p.totalOwedToYou,
        you_owe: p.totalYouOwe,
        net_balance: p.netBalance,
        expense_count: p.expenseCount,
      }));
    }

    // Payment history / timeline
    if (data.timeline) {
      return data.timeline.map((t: any) => ({
        date: new Date(t.date).toLocaleDateString(),
        type: t.type,
        description: t.description,
        amount: t.amount,
        currency: t.currency,
        direction: t.direction ?? "N/A",
      }));
    }

    // Tax report
    if (data.businessExpenses) {
      return [
        ...data.businessExpenses.map((e: any) => ({
          type: "BUSINESS",
          date: new Date(e.createdAt).toLocaleDateString(),
          description: e.description,
          category: e.category,
          amount: e.amount,
        })),
        ...data.personalExpenses.map((e: any) => ({
          type: "PERSONAL",
          date: new Date(e.createdAt).toLocaleDateString(),
          description: e.description,
          category: e.category,
          amount: e.amount,
        })),
      ];
    }

    // Fallback: raw expenses + settlements
    const expenses = (data.expenses ?? []).map((e: any) => ({
      type: "EXPENSE",
      date: new Date(e.createdAt).toLocaleDateString(),
      description: e.description,
      category: e.category,
      amount: e.amount,
      currency: e.currency,
    }));
    const settlements = (data.settlements ?? []).map((s: any) => ({
      type: "SETTLEMENT",
      date: new Date(s.createdAt).toLocaleDateString(),
      description: s.description ?? "Payment settlement",
      category: "",
      amount: s.amount,
      currency: s.currency,
    }));
    return [...expenses, ...settlements];
  }

  
}
