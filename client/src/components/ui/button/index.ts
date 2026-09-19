import { type VariantProps, cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-none text-[13px] font-medium leading-5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground aria-disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: 'border border-transparent bg-primary text-primary-foreground hover:bg-[var(--dv-action-hover)]',
        destructive: 'border border-transparent bg-destructive text-destructive-foreground hover:brightness-90',
        outline: 'border border-border bg-white text-foreground hover:bg-muted',
        secondary: 'border border-transparent bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-9 px-3.5 py-2',
        xs: 'min-h-7 px-2 py-1 text-xs',
        sm: 'min-h-8 px-2.5 py-1.5',
        lg: 'min-h-11 px-5 py-2.5',
        icon: 'size-10 p-2 [&_svg]:size-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
