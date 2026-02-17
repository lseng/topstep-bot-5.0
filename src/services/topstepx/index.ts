// TopstepX service barrel export

export {
  authenticate,
  getToken,
  getAccounts,
  getAccountSummary,
  searchContracts,
  getCurrentContractId,
  resolveContractId,
  placeOrder,
  cancelOrder,
  getOrders,
  closePosition,
  getTrades,
  getHistoricalBars,
} from './client';

export { UserHubConnection, MarketHubConnection } from './streaming';

export {
  OrderSide,
  OrderTypeNum,
  OrderStatusNum,
  BarUnit,
  CONTRACT_SPECS,
  EXPIRY_CODES,
} from './types';

export type {
  Account,
  Contract,
  Position,
  Order,
  Trade,
  Bar,
  PlaceOrderParams,
  PlaceOrderResponse,
  CancelOrderParams,
  RetrieveBarsParams,
  ContractSpec,
  GatewayOrderEvent,
  GatewayPositionEvent,
  GatewayAccountEvent,
  GatewayTradeEvent,
  GatewayQuoteEvent,
  GatewayMarketTradeEvent,
  GatewayDepthEvent,
} from './types';
