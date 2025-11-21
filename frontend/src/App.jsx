import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MetabaseProvider } from './components/MetabaseProvider';
import Navigation from './components/Navigation';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/AnalyticsSDK';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <MetabaseProvider>
        <div className="App">
          <Navigation />
          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/analytics" element={<Analytics />} />
            </Routes>
          </main>
        </div>
      </MetabaseProvider>
    </BrowserRouter>
  );
}

export default App;
