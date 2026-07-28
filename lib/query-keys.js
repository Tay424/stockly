// One place for every cache key, so a mutation always invalidates the same
// key the query registered under.
export const queryKeys = {
  categories: ["categories"],
  products: ["products"],
  sales: ["sales"],
  sellableProducts: ["products", "sellable"],
  mySales: ["sales", "mine"],
  expenses: ["expenses"],
  myExpenses: ["expenses", "mine"],
  accounts: ["accounts"],
};
