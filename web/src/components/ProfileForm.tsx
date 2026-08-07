import { useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { getVotingLocation } from '@/lib/elections';
import { APURIMAC_PROVINCES, districtsOf } from '@/lib/geo';
import type { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';

const AGE_RANGES = ['18-25', '26-35', '36-50', '51+'];
const SEXES = [
	{ value: 'masculino', label: 'Masculino' },
	{ value: 'femenino', label: 'Femenino' },
	{ value: 'prefiero_no_decir', label: 'Prefiero no decir' }
];
const EDUCATION = ['Sin estudios', 'Primaria', 'Secundaria', 'Técnico', 'Universitario', 'Posgrado'];

interface Props {
	initial?: Profile | null;
	onDone: () => void;
	onSkip?: () => void;
}

/** Opciones tipo "chips" grandes y táctiles (mobile-first). */
function OptionChips({
	options,
	value,
	onChange
}: {
	options: { value: string; label: string }[];
	value: string | null;
	onChange: (v: string) => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{options.map((opt) => (
				<button
					key={opt.value}
					type="button"
					onClick={() => onChange(opt.value)}
					className={cn(
						'min-h-[48px] rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
						value === opt.value
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-card hover:bg-accent'
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

export function ProfileForm({ initial, onDone, onSkip }: Props) {
	const [step, setStep] = useState(0);
	const [saving, setSaving] = useState(false);
	// Precarga la ubicación de votación si el perfil aún no la tiene
	const savedLocation = getVotingLocation();
	const [form, setForm] = useState<Profile>({
		ageRange: initial?.ageRange ?? null,
		sex: initial?.sex ?? null,
		district: initial?.district ?? savedLocation?.district ?? null,
		province: initial?.province ?? savedLocation?.province ?? null,
		occupation: initial?.occupation ?? null,
		educationLevel: initial?.educationLevel ?? null
	});

	const steps = [
		{
			title: '¿En qué rango de edad estás?',
			render: () => (
				<OptionChips
					options={AGE_RANGES.map((a) => ({ value: a, label: `${a} años` }))}
					value={form.ageRange}
					onChange={(v) => setForm({ ...form, ageRange: v })}
				/>
			)
		},
		{
			title: '¿Cuál es tu sexo?',
			render: () => (
				<OptionChips options={SEXES} value={form.sex} onChange={(v) => setForm({ ...form, sex: v })} />
			)
		},
		{
			title: '¿Dónde vives?',
			render: () => (
				<div className="space-y-3">
					<div>
						<Label className="mb-1.5 block text-xs text-muted-foreground">Provincia</Label>
						<Select
							value={form.province ?? ''}
							onValueChange={(v) => setForm({ ...form, province: v, district: null })}
						>
							<SelectTrigger>
								<SelectValue placeholder="Elige tu provincia" />
							</SelectTrigger>
							<SelectContent>
								{APURIMAC_PROVINCES.map((p) => (
									<SelectItem key={p.name} value={p.name}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<Label className="mb-1.5 block text-xs text-muted-foreground">Distrito</Label>
						<Select
							disabled={!form.province}
							value={form.district ?? ''}
							onValueChange={(v) => setForm({ ...form, district: v })}
						>
							<SelectTrigger>
								<SelectValue placeholder="Elige tu distrito" />
							</SelectTrigger>
							<SelectContent>
								{districtsOf(form.province).map((d) => (
									<SelectItem key={d} value={d}>
										{d}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			)
		},
		{
			title: 'Cuéntanos un poco más (opcional)',
			render: () => (
				<div className="space-y-3">
					<div>
						<Label htmlFor="occupation" className="mb-1.5 block text-xs text-muted-foreground">
							Ocupación
						</Label>
						<Input
							id="occupation"
							placeholder="Ej. Agricultor, estudiante, comerciante"
							value={form.occupation ?? ''}
							onChange={(e) => setForm({ ...form, occupation: e.target.value })}
						/>
					</div>
					<div>
						<Label className="mb-1.5 block text-xs text-muted-foreground">Nivel educativo</Label>
						<OptionChips
							options={EDUCATION.map((e) => ({ value: e, label: e }))}
							value={form.educationLevel}
							onChange={(v) => setForm({ ...form, educationLevel: v })}
						/>
					</div>
				</div>
			)
		}
	];

	const isLast = step === steps.length - 1;

	const submit = async () => {
		setSaving(true);
		try {
			await api.post('/profile', form);
			toast.success('¡Gracias! Tu perfil ayuda a que la encuesta sea más representativa.');
			onDone();
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el perfil');
		} finally {
			setSaving(false);
		}
	};

	const next = () => {
		if (isLast) void submit();
		else setStep(step + 1);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>
					Pregunta {step + 1} de {steps.length}
				</span>
				<span className="flex items-center gap-1 text-primary">
					<Check className="h-3 w-3" /> Tu voto ya está registrado
				</span>
			</div>
			<Progress value={((step + 1) / steps.length) * 100} />

			<div className="rounded-xl border bg-card p-4">
				<h3 className="mb-3 text-base font-semibold">{steps[step].title}</h3>
				{steps[step].render()}
			</div>

			<div className="flex items-center justify-between gap-2">
				<Button variant="ghost" size="sm" onClick={onSkip ?? onDone} disabled={saving}>
					Omitir por ahora
				</Button>
				<div className="flex gap-2">
					{step > 0 && (
						<Button variant="outline" size="icon" onClick={() => setStep(step - 1)} aria-label="Anterior">
							<ChevronLeft className="h-4 w-4" />
						</Button>
					)}
					<Button onClick={next} disabled={saving} className="min-w-[120px]">
						{saving ? 'Guardando…' : isLast ? 'Finalizar' : 'Siguiente'}
						{!isLast && <ChevronRight className="ml-1 h-4 w-4" />}
					</Button>
				</div>
			</div>

			<p className="text-center text-xs text-muted-foreground">
				Toda la información es opcional y se usa solo de forma agregada y anónima.
			</p>
		</div>
	);
}
