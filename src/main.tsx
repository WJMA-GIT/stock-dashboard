import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { matchRoutes } from 'react-router-dom';
import {
  initializeFaro,
  createReactRouterV6DataOptions,
  ReactIntegration,
  getWebInstrumentations,
} from '@grafana/faro-react';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import './index.css';

// Faro 必须先于 router 模块求值（withFaroRouterInstrumentation 依赖已初始化的实例），
// 且先于首次渲染（否则初始渲染期的错误不会上报）——静态 import App 会被提升到本段之前，故用动态 import
if (import.meta.env.PROD) {
  initializeFaro({
    url: 'https://faro-collector-prod-ap-southeast-1.grafana.net/collect/d730ce3555958ea089459acd1cd6886b',
    app: {
      name: 'stock-dashboard',
      version: '1.0.0',
      environment: 'production',
    },

    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation(),
      new ReactIntegration({
        router: createReactRouterV6DataOptions({
          matchRoutes,
        }),
      }),
    ],
  });
}

import('./App').then(({ App }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
