import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DepreciationModelsScreen } from './screens/depreciation-models/DepreciationModelsScreen'
import { PaymentMethodsScreen } from './screens/payment-methods/PaymentMethodsScreen'
import { IsocSchemesScreen } from './screens/isoc-schemes/IsocSchemesScreen'
import { VatSchemesScreen } from './screens/vat-schemes/VatSchemesScreen'
import { Placeholder } from './screens/Placeholder'
import { CategoriesScreen } from './screens/categories/CategoriesScreen'
import { TiersScreen } from './screens/tiers/TiersScreen'
import { AppShell } from './shell/AppShell'
import { FiscalYearProvider } from './shell/FiscalYearContext'

export default function App() {
  return (
    <BrowserRouter>
      <FiscalYearProvider>
        <Routes>
          <Route element={<AppShell />}>
            {/* The shell shows the first-year step on "/" while no year exists; this redirect renders only once one does. */}
            <Route index element={<Navigate to="/societe" replace />} />
            <Route path="societe" element={<Placeholder title="Structure société" />} />
            <Route path="tiers" element={<TiersScreen />} />
            <Route path="categories" element={<CategoriesScreen />} />
            <Route path="regimes-tva" element={<VatSchemesScreen />} />
            <Route path="regimes-isoc" element={<IsocSchemesScreen />} />
            <Route path="modeles-amortissement" element={<DepreciationModelsScreen />} />
            <Route path="moyens-paiement" element={<PaymentMethodsScreen />} />
            <Route path="*" element={<Navigate to="/societe" replace />} />
          </Route>
        </Routes>
      </FiscalYearProvider>
    </BrowserRouter>
  )
}
