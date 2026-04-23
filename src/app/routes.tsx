import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SplitHome } from './SplitHome';
import { WalletView } from './WalletView';
import { Settings } from './Settings';
import { TradeDetail } from './TradeDetail';
import { DayDetail } from './DayDetail';
import { Strategies } from './Strategies';

const router = createBrowserRouter(
  [
    { path: '/', element: <SplitHome /> },
    { path: '/w/:address', element: <WalletView /> },
    { path: '/w/:address/t/:tradeId', element: <TradeDetail /> },
    { path: '/d/:date', element: <DayDetail /> },
    { path: '/strategies', element: <Strategies /> },
    { path: '/settings', element: <Settings /> },
  ],
  {
    basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  },
);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
