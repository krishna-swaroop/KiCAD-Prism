import type { ReactNode } from "react";

interface SectionProps {
    step: number;
    title: string;
    description: string;
    trailing?: ReactNode;
}

export function SectionHeading({ step, title, description, trailing }: SectionProps) {
    return (
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center bg-muted text-[10px] font-medium text-muted-foreground"
                aria-hidden="true"
            >
                {step}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium">{title}</h4>
                    {trailing}
                </div>
                <p className="text-[11px] text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

export function FormSection({ step, title, description, trailing, children }: SectionProps & { children: ReactNode }) {
    return (
        <section className="space-y-3">
            <SectionHeading step={step} title={title} description={description} trailing={trailing} />
            {children}
        </section>
    );
}
