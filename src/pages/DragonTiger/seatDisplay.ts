export interface SeatDisplayItem {
  name: string;
  amount: number;
  summary?: boolean;
}

interface SeatLike {
  branchName: string;
  buyAmount: number | null;
  sellAmount: number | null;
  netAmount: number | null;
  side: 'buy' | 'sell';
}

export function splitSeats(seats: SeatLike[]) {
  const toItem = (seat: SeatLike): SeatDisplayItem => ({
    name: seat.branchName,
    amount: seat.netAmount ?? ((seat.buyAmount ?? 0) - (seat.sellAmount ?? 0)),
  });

  return {
    buyers: seats.filter((seat) => seat.side === 'buy').sort((a, b) => (b.buyAmount ?? 0) - (a.buyAmount ?? 0)).slice(0, 4).map(toItem),
    sellers: seats.filter((seat) => seat.side === 'sell').sort((a, b) => (b.sellAmount ?? 0) - (a.sellAmount ?? 0)).slice(0, 4).map(toItem),
  };
}
