export function Footer() {
	return (
		<footer className="mt-auto border-t py-6">
			<div className="mx-auto max-w-5xl px-4 text-xs text-muted-foreground">
				<div className="mx-auto max-w-lg">
					<details className="group">
						<summary className="cursor-pointer select-none text-center font-medium text-foreground/80 hover:text-foreground">
							¿Cómo funciona?
						</summary>
						<div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-4 text-left leading-relaxed">
							<p>
								Cada lunes abre una nueva encuesta semanal y puedes votar una vez por semana
								hasta el domingo.
							</p>
							<p>
								Según tu provincia y distrito recibes las cédulas de gobierno regional, alcaldía
								provincial y, si tu distrito no es capital provincial, alcaldía distrital.
							</p>
							<p>
								Tu voto es anónimo: se usa tu cuenta de Google únicamente para garantizar un
								solo voto por persona.
							</p>
							<p>Sondeo de opinión sin valor oficial; los resultados son referenciales.</p>
						</div>
					</details>
				</div>
				<p className="mt-4 text-center">
					Encuesta ciudadana semanal · Andahuaylas, Apurímac ·{' '}
					<a href="https://voto.pukllayandahuaylas.pe" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
						voto.pukllayandahuaylas.pe
					</a>
				</p>
				<p className="mt-1 text-center">
					Sondeo de opinión sin valor oficial. Un voto por persona por semana. Resultados referenciales.
				</p>
			</div>
		</footer>
	);
}
