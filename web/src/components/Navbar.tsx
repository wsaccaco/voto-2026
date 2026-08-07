import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BarChart3, Landmark, LogOut, Menu, Moon, ShieldCheck, Sun, User, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { signInWithGoogle, signOut } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

const navItems = [
	{ to: '/', label: 'Inicio', end: true },
	{ to: '/comparativo', label: 'Comparativo' },
	{ to: '/resultados', label: 'Resultados' }
];

export function Navbar() {
	const { user, loading } = useAuth();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [dark, setDark] = useState(false);

	useEffect(() => {
		setDark(document.documentElement.classList.contains('dark'));
	}, []);

	const toggleTheme = () => {
		const next = !dark;
		setDark(next);
		document.documentElement.classList.toggle('dark', next);
		try {
			localStorage.setItem('theme', next ? 'dark' : 'light');
		} catch {
			/* almacenamiento no disponible */
		}
	};

	const initials = user?.name
		? user.name
				.split(' ')
				.slice(0, 2)
				.map((p) => p[0])
				.join('')
				.toUpperCase()
		: '?';

	return (
		<header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
				<div className="flex items-center gap-6">
					<NavLink to="/" className="flex items-center gap-2 font-semibold">
						<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
							<Landmark className="h-4 w-4" />
						</span>
						<span className="hidden sm:inline">Encuesta Apurímac</span>
						<span className="sm:hidden">Encuesta</span>
					</NavLink>
					<nav className="hidden items-center gap-1 md:flex">
						{navItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								end={item.end}
								className={({ isActive }) =>
									cn(
										'rounded-md px-3 py-2 text-sm font-medium transition-colors',
										isActive
											? 'bg-accent text-accent-foreground'
											: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
									)
								}
							>
								{item.label}
							</NavLink>
						))}
						{user?.isAdmin && (
							<NavLink
								to="/admin"
								className={({ isActive }) =>
									cn(
										'flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
										isActive
											? 'bg-accent text-accent-foreground'
											: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
									)
								}
							>
								<ShieldCheck className="h-4 w-4" /> Admin
							</NavLink>
						)}
					</nav>
				</div>

				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
						{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
					</Button>

					{loading ? (
						<div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
					) : user ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button className="rounded-full outline-none ring-ring focus-visible:ring-2">
									<Avatar className="h-9 w-9">
										<AvatarImage src={user.image ?? undefined} alt={user.name ?? 'usuario'} />
										<AvatarFallback>{initials}</AvatarFallback>
									</Avatar>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuLabel>
									<div className="text-sm font-medium">{user.name}</div>
									<div className="truncate text-xs text-muted-foreground">{user.email}</div>
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => navigate('/perfil')}>
									<User className="mr-2 h-4 w-4" /> Mi perfil
								</DropdownMenuItem>
								{user.isAdmin && (
									<DropdownMenuItem onClick={() => navigate('/admin')}>
										<ShieldCheck className="mr-2 h-4 w-4" /> Panel admin
									</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={async () => {
										await signOut();
										toast.success('Sesión cerrada');
									}}
								>
									<LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<Button size="sm" onClick={() => signInWithGoogle()}>
							Ingresar
						</Button>
					)}

					<Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menú">
						{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
					</Button>
				</div>
			</div>

			{open && (
				<nav className="border-t px-4 py-2 md:hidden">
					{navItems.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							end={item.end}
							onClick={() => setOpen(false)}
							className={({ isActive }) =>
								cn(
									'block rounded-md px-3 py-2 text-sm font-medium',
									isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'
								)
							}
						>
							{item.label}
						</NavLink>
					))}
					{user?.isAdmin && (
						<NavLink
							to="/admin"
							onClick={() => setOpen(false)}
							className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/60"
						>
							<BarChart3 className="mr-1 inline h-4 w-4" /> Panel admin
						</NavLink>
					)}
				</nav>
			)}
		</header>
	);
}
