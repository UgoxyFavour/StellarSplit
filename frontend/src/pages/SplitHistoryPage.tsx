import { useEffect, useMemo, useState } from "react";
import { SplitTimeline } from "../components/SplitHistory/SplitTimeline";
import {
  HistoryFilters,
  type FiltersState,
} from "../components/SplitHistory/HistoryFilters";
import { HistorySummary } from "../components/SplitHistory/HistorySummary";
import { formatCurrency } from "../utils/format";
import { apiClient } from "../utils/api-client";

export type SplitStatus = "active" | "completed" | "cancelled";
export type SplitRole = "creator" | "participant";

export interface HistoryParticipant {
  id: string;
  name: string;
}

export interface HistorySplit {
  id: string;
  title: string;
  totalAmount: number;
  currency: string;
  date: string; // ISO
  status: SplitStatus;
  participants: HistoryParticipant[];
  role: SplitRole;
}

const MOCK_SPLITS: HistorySplit[] = [
  {
    id: "s-1001",
    title: "Dinner at Nobu",
    totalAmount: 450,
    currency: "USD",
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: "completed",
    participants: [
      { id: "1", name: "You" },
      { id: "2", name: "Sarah" },
      { id: "3", name: "Mike" },
    ],
    role: "participant",
  },
  {
    id: "s-1002",
    title: "Grocery Run",
    totalAmount: 120.5,
    currency: "USD",
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    participants: [
      { id: "1", name: "You" },
      { id: "4", name: "Jess" },
    ],
    role: "creator",
  },
  {
    id: "s-1003",
    title: "Weekend Road Trip",
    totalAmount: 980,
    currency: "USD",
    date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    status: "cancelled",
    participants: [
      { id: "1", name: "You" },
      { id: "5", name: "Adebayo" },
      { id: "6", name: "Lara" },
    ],
    role: "participant",
  },
  {
    id: "s-1004",
    title: "Team Lunch",
    totalAmount: 245,
    currency: "USD",
    date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    status: "completed",
    participants: [
      { id: "1", name: "You" },
      { id: "7", name: "Ola" },
      { id: "8", name: "Ife" },
    ],
    role: "creator",
  },
  {
    id: "s-1005",
    title: "Concert Tickets",
    totalAmount: 360,
    currency: "USD",
    date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    participants: [
      { id: "1", name: "You" },
      { id: "9", name: "Kemi" },
    ],
    role: "participant",
  },
];

function useSplitHistory() {
  const [splits, setSplits] = useState<HistorySplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      setLoading(true);
      try {
        // Try backend; fall back to mock on failure
        const res = await apiClient.get<HistorySplit[]>("/splits/history");
        if (mounted) setSplits(res.data);
      } catch {
        if (mounted) setSplits(MOCK_SPLITS);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => {
      mounted = false;
    };
  }, []);

  return { splits, loading, error };
}

function exportToCSV(rows: HistorySplit[], filename = "split-history.csv") {
  const header = [
    "id",
    "title",
    "date",
    "status",
    "amount",
    "currency",
    "role",
    "participants",
  ];
  const csvRows = rows.map((s) =>
    [
      s.id,
      escapeCsv(s.title),
      new Date(s.date).toISOString(),
      s.status,
      s.totalAmount.toFixed(2),
      s.currency,
      s.role,
      s.participants.map((p) => p.name).join("; "),
    ].join(","),
  );
  const csv = [header.join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/\"/g, '""')}"`;
  }
  return value;
}

export default function SplitHistoryPage() {
  const { splits, loading } = useSplitHistory();
  const [filters, setFilters] = useState<FiltersState>({
    statuses: new Set<SplitStatus>(["active", "completed", "cancelled"]),
    role: "all",
    search: "",
    sort: "date-desc",
  });
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const byStatus = splits.filter((s) => filters.statuses.has(s.status));
    const byRole =
      filters.role === "all"
        ? byStatus
        : byStatus.filter((s) => s.role === filters.role);
    const search = filters.search.trim().toLowerCase();
    const bySearch = !search
      ? byRole
      : byRole.filter(
          (s) =>
            s.title.toLowerCase().includes(search) ||
            s.participants.some((p) => p.name.toLowerCase().includes(search)),
        );

    const sorted = [...bySearch].sort((a, b) => {
      switch (filters.sort) {
        case "date-asc":
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "date-desc":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "amount-asc":
          return a.totalAmount - b.totalAmount;
        case "amount-desc":
          return b.totalAmount - a.totalAmount;
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return sorted;
  }, [splits, filters]);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.role, filters.sort, filters.statuses]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const summary = useMemo(() => {
    const totalAmount = filtered.reduce((sum, s) => sum + s.totalAmount, 0);
    const counts = filtered.reduce(
      (acc, s) => {
        acc[s.status] += 1;
        return acc;
      },
      { active: 0, completed: 0, cancelled: 0 } as Record<SplitStatus, number>,
    );
    const avg = filtered.length ? totalAmount / filtered.length : 0;
    return { total: filtered.length, totalAmount, counts, avg };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-6 pb-20 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Split History</h1>
          <button
            type="button"
            onClick={() => exportToCSV(filtered)}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
          >
            Export CSV
          </button>
        </div>

        <HistoryFilters value={filters} onChange={setFilters} />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            {loading ? (
              <LoadingSkeleton />
            ) : pageItems.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
                <p className="text-gray-600 dark:text-gray-300">
                  No splits found
                </p>
              </div>
            ) : (
              <SplitTimeline splits={pageItems} />
            )}

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Showing {pageItems.length} of {filtered.length}
              </p>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700 text-sm disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Prev
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-200">
                  Page {page} / {totalPages}
                </span>
                <button
                  className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700 text-sm disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <HistorySummary
              total={summary.total}
              totalAmountLabel={formatCurrency(summary.totalAmount)}
              active={summary.counts.active}
              completed={summary.counts.completed}
              cancelled={summary.counts.cancelled}
              averageLabel={formatCurrency(summary.avg)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-24 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl animate-pulse"
        />
      ))}
    </div>
  );
}
