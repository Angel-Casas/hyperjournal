import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SplitHome } from './SplitHome';

const router = createBrowserRouter([{ path: '/', element: <SplitHome /> }], {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});

export function AppRouter() {
  return <RouterProvider router={router} />;
}
