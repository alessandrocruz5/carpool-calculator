"use client";
import { useAsync } from "./useAsync";
import { getLatestGasPrice, upsertGasPrice } from "@/lib/db/gasPrices";

export function useGasPrice() {
  const state = useAsync(getLatestGasPrice, []);
  return {
    ...state,
    gasPrice: state.data ? Number(state.data.price_per_liter) : 0,
    updatedAt: state.data?.effective_date ?? null,
    async set(date: string, price: number) {
      await upsertGasPrice(date, price);
      await state.refresh();
    },
  };
}
