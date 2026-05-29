"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  background: "white",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  padding: "6px 10px",
};

export function TrendChart({ data }: { data: { date: string; sales: number; orders: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(16, 90%, 55%)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="hsl(16, 90%, 55%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(214, 32%, 91%)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
        <Area type="monotone" dataKey="sales" stroke="hsl(16, 90%, 55%)" strokeWidth={2} fill="url(#sales)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HourlyChart({ data }: { data: { hour: number; orders: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(214, 32%, 91%)" />
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(h: number) => (h % 3 === 0 ? `${h}:00` : "")}
        />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(h: number) => `${h}:00`} />
        <Bar dataKey="orders" fill="hsl(16, 90%, 55%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
