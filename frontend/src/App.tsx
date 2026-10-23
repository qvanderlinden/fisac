import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DepreciationModelsScreen } from './screens/depreciation-models/DepreciationModelsScreen'
import { PaymentMethodsScreen } from './screens/payment-methods/PaymentMethodsScreen'
import { IsocSchemesScreen } from './screens/isoc-schemes/IsocSchemesScreen'
import { VatSchemesScreen } from './screens/vat-schemes/VatSchemesScreen'
import { CompanyScreen } from './screens/company/CompanyScreen'
import { CategoriesScreen } from './screens/categories/CategoriesScreen'
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
            {/* Stubs until the screens of tasks 9 to 13 replace them. */}
            <Route path="ventes/*" element={<UnderConstruction />} />
            <Route path="achats/*" element={<UnderConstruction />} />
            <Route path="immobilisations/*" element={<UnderConstruction />} />
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
