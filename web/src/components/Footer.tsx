export function Footer() {
	return (
		<footer className="mt-auto border-t py-6">
			<div className="mx-auto max-w-5xl px-4 text-center text-xs text-muted-foreground">
				<p>
					Encuesta ciudadana semanal · Andahuaylas, Apurímac ·{' '}
					<a href="https://voto.pukllayandahuaylas.pe" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
						voto.pukllayandahuaylas.pe
					</a>
				</p>
				<p className="mt-1">
					Sondeo de opinión sin valor oficial. Un voto por persona por semana. Resultados referenciales.
				</p>
			</div>
		</footer>
	);
}
