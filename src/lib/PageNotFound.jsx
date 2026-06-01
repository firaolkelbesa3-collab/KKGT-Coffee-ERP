import { useLocation, useNavigate } from 'react-router-dom';
import { Coffee, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PageNotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageName = location.pathname.substring(1);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center animate-fade-up">
        {/* Brand mark with a wandering coffee cup */}
        <div className="relative mx-auto w-20 h-20 mb-6">
          <div className="absolute inset-0 rounded-2xl bg-primary/10" />
          <Coffee className="absolute inset-0 m-auto w-9 h-9 text-primary" aria-hidden="true" />
        </div>

        <p className="text-6xl font-display font-bold text-primary/20 leading-none">404</p>

        <h1 className="mt-4 text-2xl font-semibold text-foreground">
          This page brewed off somewhere
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          We couldn&apos;t find{' '}
          {pageName
            ? <span className="font-medium text-foreground">&ldquo;/{pageName}&rdquo;</span>
            : 'that page'}
          . It may have moved, or the link was mistyped.
        </p>

        <div className="mt-7 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)} className="press">
            <ArrowLeft className="w-4 h-4 mr-2" /> Go back
          </Button>
          <Button onClick={() => navigate('/')} className="press">
            <Home className="w-4 h-4 mr-2" /> Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
