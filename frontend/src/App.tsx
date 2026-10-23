import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Placeholder } from './screens/Placeholder'
import { AppShell } from './shell/AppShell'
import { FiscalYearProvider } from './shell/FiscalYearContext'

export default function App() {
  return (
    <BrowserRouter>
      <FiscalYearProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/societe" replace />} />
            <Route path="societe" element={<Placeholder title="Structure société" />} />
            <Route path="tiers" element={<Placeholder title="Tiers" />} />
            <Route path="categories" element={<Placeholder title="Catégories" />} />
            <Route path="regimes-tva" element={<Placeholder title="Régimes de TVA" />} />
            <Route path="regimes-isoc" element={<Placeholder title="Régimes ISOC" />} />
            <Route path="modeles-amortissement" element={<Placeholder title="Modèles d’amortissement" />} />
            <Route path="moyens-paiement" element={<Placeholder title="Moyens de paiement" />} />
            <Route path="*" element={<Navigate to="/societe" replace />} />
          </Route>
        </Routes>
      </FiscalYearProvider>
    </BrowserRouter>
  )
}
