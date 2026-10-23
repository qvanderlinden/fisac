import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DepreciationModelsScreen } from './screens/depreciation-models/DepreciationModelsScreen'
import { PaymentMethodsScreen } from './screens/payment-methods/PaymentMethodsScreen'
import { IsocSchemesScreen } from './screens/isoc-schemes/IsocSchemesScreen'
import { VatSchemesScreen } from './screens/vat-schemes/VatSchemesScreen'
import { CompanyScreen } from './screens/company/CompanyScreen'
import { FixedAssetsScreen } from './screens/fixed-assets/FixedAssetsScreen'
import { CategoriesScreen } from './screens/categories/CategoriesScreen'
import { PurchasesScreen } from './screens/purchases/PurchasesScreen'
import { SalesScreen } from './screens/sales/SalesScreen'
import { TiersScreen } from './screens/tiers/TiersScreen'
import { AppShell } from './shell/AppShell'
import { FiscalYearProvider } from './shell/FiscalYearContext'
import { UnderConstruction } from './shell/UnderConstruction'

export default function App() {
  return (
    <BrowserRouter>
      <FiscalYearProvider>
        <Routes>
          <Route element={<AppShell />}>
            {/* The shell shows the first-year step on "/" while no year exists; this redirect renders only once one does. */}
            <Route index element={<Navigate to="/societe" replace />} />
            <Route path="ventes/*" element={<SalesScreen />} />
            <Route path="achats/*" element={<PurchasesScreen />} />
            {/* Stubs until the screens of tasks 12 and 13 replace them. */}
            <Route path="immobilisations/*" element={<FixedAssetsScreen />} />
            <Route path="journaux/*" element={<UnderConstruction />} />
            <Route path="tva/*" element={<UnderConstruction />} />
            <Route path="resultat/*" element={<UnderConstruction />} />
            <Route path="societe" element={<CompanyScreen />} />
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
