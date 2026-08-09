import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, MapPin, Vote } from 'lucide-react';
import { LocationPicker } from '@/components/LocationPicker';
import { SignInButton } from '@/components/SignInButton';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth-context';
import {
	clearVotingLocation,
	getVotingLocation,
	locationLabel,
	setVotingLocation,
	type VotingLocation
} from '@/lib/elections';
import type { Survey } from '@/lib/types';

/** Marca local de descarte: guarda la semana en que se cerró la invitación. */
const DISMISS_KEY = 'encuesta:invitacion-descartada';

interface VoteInviteProps {
	/** Encuestas abiertas en las que el usuario puede participar. */
	surveys: Survey[];
	/** True si el usuario ya votó todas sus encuestas de la semana. */
	hasVoted: boolean;
	/** Identificador de la semana: si cambia, la invitación vuelve a mostrarse. */
	weekKey: string;
}

/**
 * Invitación a votar desde las páginas de resultados: modal que se abre
 * automáticamente una vez por semana electoral, con selección de
 * provincia/distrito integrada antes de ir a votar.
 */
export function VoteInvite({ surveys, hasVoted, weekKey }: VoteInviteProps) {
	const { user, loading } = useAuth();
	const [location, setLocation] = useState<VotingLocation | null>(() => getVotingLocation());
	const [picking, setPicking] = useState(false);
	const [open, setOpen] = useState(false);

	const relevant = surveys.length > 0 && !hasVoted;

	// Apertura automática: una sola vez por semana electoral (salvo descarte).
	// En el primer contacto sin ubicación registrada se abre de inmediato, sin
	// esperar ni depender de descartes previos.
	useEffect(() => {
		if (!relevant || !weekKey) return;
		const firstContact = !getVotingLocation();
		if (firstContact) {
			setOpen(true);
			return;
		}
		try {
			if (localStorage.getItem(DISMISS_KEY) === weekKey) return;
		} catch {
			/* almacenamiento no disponible */
		}
		const timer = setTimeout(() => setOpen(true), 600);
		return () => clearTimeout(timer);
	}, [relevant, weekKey]);

	if (!relevant) return null;

	const dismiss = () => {
		try {
			localStorage.setItem(DISMISS_KEY, weekKey);
		} catch {
			/* almacenamiento no disponible */
		}
		setOpen(false);
	};

	const choose = (loc: VotingLocation) => {
		setVotingLocation(loc);
		setLocation(loc);
		setPicking(false);
	};

	const changeLocation = () => {
		clearVotingLocation();
		setLocation(null);
		setPicking(true);
	};

	const loggedIn = !loading && Boolean(user);
	// El distrito es crucial para las encuestas: sin ubicación no se puede continuar
	const needsLocation = !location || picking;

	return (
		<Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>¿Ya votaste esta semana?</DialogTitle>
					<DialogDescription>
						Los resultados se construyen con tu participación. Un voto por persona por semana.
					</DialogDescription>
				</DialogHeader>

				{needsLocation ? (
					<div className="max-h-[55vh] overflow-y-auto pr-1">
						<p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
							<MapPin className="h-4 w-4 text-primary" /> ¿Dónde vives?
						</p>
						<p className="mb-3 text-xs text-muted-foreground">
							Tu provincia y distrito determinan las encuestas que recibes: gobierno
							regional, alcaldía provincial y, si tu distrito no es capital provincial,
							alcaldía distrital.
						</p>
						<LocationPicker onPick={choose} />
					</div>
				) : (
					<div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-3">
						<p className="flex items-center text-sm">
							<Check className="mr-1.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
							Vives en <strong className="ml-1">{locationLabel(location)}</strong>
						</p>
						<Button variant="ghost" size="sm" onClick={changeLocation}>
							Cambiar
						</Button>
					</div>
				)}

				<DialogFooter className="flex-col gap-2 sm:flex-col">
					{loggedIn ? (
						<Button asChild className="w-full" disabled={needsLocation}>
							<Link to="/votar">
								<Vote className="mr-2 h-4 w-4" /> Ir a votar
							</Link>
						</Button>
					) : (
						<SignInButton className="w-full" disabled={needsLocation} returnTo="/votar" />
					)}
					<Button variant="ghost" className="w-full" onClick={dismiss}>
						Ahora no
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
