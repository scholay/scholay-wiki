/**
 * 基础原子组件 — shadcn 风格,Radix 驱动
 * 业务页面统一 `import { Button, Input, ... } from '@/shared/ui'`
 */
export { Avatar, AvatarFallback, AvatarImage } from './avatar';
export { Badge, badgeVariants } from './badge';
export { Button, buttonVariants, type ButtonProps } from './button';
export { Checkbox } from './checkbox';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './dialog';
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from './form';
export { Input, type InputProps } from './input';
export { Kbd } from './kbd';
export { Label } from './label';
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from './popover';
// resizable(react-resizable-panels)不再从 barrel re-export(性能审计 #2):消费方均走子路径 '@/shared/ui/resizable',
// 从 barrel 导出会让任何 barrel 消费方潜在滞留 react-resizable-panels。用它请直接 import from '@/shared/ui/resizable'。
export { ScrollArea, ScrollBar } from './scroll-area';
export { Separator } from './separator';
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from './sheet';
export { Skeleton } from './skeleton';
export { Switch } from './switch';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
