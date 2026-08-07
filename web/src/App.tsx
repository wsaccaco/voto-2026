import { Route, Routes } from 'react-router-dom';
import { Footer } from '@/components/Footer';
import { Navbar } from '@/components/Navbar';
import { Toaster } from '@/components/ui/sonner';
import Admin from '@/pages/Admin';
import Comparison from '@/pages/Comparison';
import Home from '@/pages/Home';
import Profile from '@/pages/Profile';
import Results from '@/pages/Results';
import ResultsIndex from '@/pages/ResultsIndex';
import Survey from '@/pages/Survey';
import Votar from '@/pages/Votar';

export default function App() {
	return (
		<div className="flex min-h-svh flex-col">
			<Navbar />
			<main className="flex-1">
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/votar" element={<Votar />} />
					<Route path="/encuesta/:id" element={<Survey />} />
					<Route path="/resultados" element={<ResultsIndex />} />
					<Route path="/resultados/:id" element={<Results />} />
					<Route path="/comparativo" element={<Comparison />} />
					<Route path="/perfil" element={<Profile />} />
					<Route path="/admin" element={<Admin />} />
					<Route path="*" element={<Home />} />
				</Routes>
			</main>
			<Footer />
			<Toaster richColors position="top-center" />
		</div>
	);
}
