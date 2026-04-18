import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  CheckCircle,
  ChefHat,
  CreditCard,
  Facebook,
  Instagram,
  LayoutGrid,
  Mail,
  MapPin,
  Menu,
  Phone,
  ShoppingBag,
  Star,
  Twitter,
  Utensils,
} from 'lucide-react';

const REVIEWS = [
  {
    id: 1,
    name: 'Sarah J.',
    role: 'Food Critic',
    text: "The most immersive dining experience I've had in years. The digital menu is a game changer.",
    rating: 5,
    img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 2,
    name: 'Michael C.',
    role: 'Frequent Diner',
    text: 'Incredible UX. Ordering is seamless, and the food visuals are mouth-watering.',
    rating: 5,
    img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 3,
    name: 'Emily R.',
    role: 'Chef',
    text: 'A perfect blend of technology and culinary art. Highly recommended.',
    rating: 4,
    img: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80'
  },
];

const APP_FEATURES = [
  {
    title: 'Table Selection',
    desc: 'Guests can pick the right table before ordering and continue the same dining session smoothly.',
    icon: LayoutGrid
  },
  {
    title: 'Smart Ordering',
    desc: 'Browse the menu, place orders, and review items without waiting for manual service.',
    icon: ShoppingBag
  },
  {
    title: 'Call Waiter',
    desc: 'Need help during the meal? Request staff support directly from the app.',
    icon: BellRing
  },
  {
    title: 'Fast Payments',
    desc: 'Pay quickly from the app and reduce delays at the end of the dining experience.',
    icon: CreditCard
  },
];

const Logo = ({ className = '', light = false }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <div className="relative flex h-12 w-12 items-center justify-center">
      <Utensils
        className={`absolute z-10 h-8 w-8 ${light ? 'text-white' : 'text-gray-900'}`}
        strokeWidth={1.5}
      />
      <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${light ? 'border-white' : 'border-gray-900'}`}>
        <div className={`h-6 w-6 rotate-45 rounded-full border-b-2 border-r-2 ${light ? 'border-white' : 'border-gray-900'}`}></div>
      </div>
    </div>
    <div>
      <h1 className={`text-xl font-bold tracking-tight ${light ? 'text-white' : 'text-gray-900'}`}>SmartDine</h1>
      <p className={`text-[10px] italic ${light ? 'text-orange-200' : 'text-orange-600'}`}>Experience Crafted for You.</p>
    </div>
  </div>
);

const Button = ({
  children,
  className = '',
  variant = 'primary',
  icon: Icon,
  fullWidth = false,
  ...props
}) => {
  const baseStyle = `${fullWidth ? 'w-full' : 'w-auto'} flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold tracking-wide transition-all duration-300 active:scale-95 cursor-pointer`;
  const variants = {
    primary: 'bg-orange-500 text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600 hover:shadow-orange-500/50',
    secondary: 'border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50',
    outline: 'border-2 border-orange-500 bg-transparent text-orange-500 hover:bg-orange-50',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100'
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
      {Icon && <Icon size={18} />}
    </button>
  );
};

const TiltCard = ({ children, className = '' }) => {
  const [transform, setTransform] = useState('');
  const ref = useRef(null);

  const handleMouseMove = (e) => {
    if (!ref.current) return;

    const { left, top, width, height } = ref.current.getBoundingClientRect();
    const x = (e.clientX - left) / width - 0.5;
    const y = (e.clientY - top) / height - 0.5;
    setTransform(`perspective(1000px) rotateY(${x * 10}deg) rotateX(${y * -10}deg) scale3d(1.02, 1.02, 1.02)`);
  };

  const handleMouseLeave = () => {
    setTransform('perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)');
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`will-change-transform transition-transform duration-200 ease-out ${className}`}
      style={{ transform }}
    >
      {children}
    </div>
  );
};

const Navbar = ({ transparent = false }) => {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (sectionId) => {
    if (!sectionId) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setMobileMenuOpen(false);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navClass = transparent && !isScrolled
    ? 'border-transparent bg-transparent py-6 text-white'
    : 'border-gray-100 bg-white/90 py-4 text-gray-900 shadow-sm backdrop-blur-md';

  return (
    <nav className={`fixed left-0 right-0 top-0 z-50 border-b transition-all duration-300 ${navClass}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <div className="cursor-pointer">
          <Logo light={transparent && !isScrolled} />
        </div>

        <div className="hidden items-center gap-8 md:flex">
          <button type="button" onClick={() => scrollToSection()} className="font-medium transition-colors hover:text-orange-500">Home</button>
          <button type="button" onClick={() => scrollToSection('about')} className="font-medium transition-colors hover:text-orange-500">About Us</button>
          <button type="button" onClick={() => scrollToSection('reviews')} className="font-medium transition-colors hover:text-orange-500">Reviews</button>
          <div className="ml-4 flex items-center gap-3">
            <Button
              variant={transparent && !isScrolled ? 'outline' : 'ghost'}
              className={transparent && !isScrolled ? 'border-white text-white hover:bg-white hover:text-gray-900' : ''}
              onClick={() => navigate('/login')}
            >
              Log In
            </Button>
            <Button variant="primary" onClick={() => navigate('/signup')}>
              Sign Up
            </Button>
          </div>
        </div>

        <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          <Menu size={24} />
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="absolute left-0 right-0 top-full flex flex-col gap-4 border-b border-gray-100 bg-white p-6 shadow-xl md:hidden">
          <button type="button" onClick={() => scrollToSection()} className="py-2 text-left font-medium text-gray-700">Home</button>
          <button type="button" onClick={() => scrollToSection('about')} className="py-2 text-left font-medium text-gray-700">About Us</button>
          <button type="button" onClick={() => scrollToSection('reviews')} className="py-2 text-left font-medium text-gray-700">Reviews</button>
          <hr />
          <Button
            variant="secondary"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate('/login');
            }}
          >
            Log In
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate('/signup');
            }}
          >
            Sign Up
          </Button>
        </div>
      )}
    </nav>
  );
};

const Footer = () => {
  const navigate = useNavigate();
  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="bg-gray-900 py-16 text-gray-300">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 md:grid-cols-4">
        <div>
          <Logo light className="mb-6" />
          <p className="text-sm leading-relaxed text-gray-400">
            SmartDine helps guests browse the menu, reserve a table, order faster, and pay without waiting.
          </p>
        </div>

        <div>
          <h4 className="mb-6 text-sm font-bold uppercase tracking-wider text-white">Quick Links</h4>
          <ul className="space-y-3 text-sm">
            <li>
              <button className="transition-colors hover:text-orange-500" onClick={() => navigate('/login')}>
                Show Menu
              </button>
            </li>
            <li>
              <button className="transition-colors hover:text-orange-500" onClick={() => navigate('/login')}>
                Book a Table
              </button>
            </li>
            <li>
              <button type="button" className="transition-colors hover:text-orange-500" onClick={() => scrollToSection('about')}>Our Story</button>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-6 text-sm font-bold uppercase tracking-wider text-white">Contact</h4>
          <ul className="space-y-4 text-sm">
            <li className="flex items-center gap-3"><MapPin size={16} className="text-orange-500" /> 123 Gourmet Ave, Food District</li>
            <li className="flex items-center gap-3"><Phone size={16} className="text-orange-500" /> +91 987 654 3210</li>
            <li className="flex items-center gap-3"><Mail size={16} className="text-orange-500" /> hello@smartdine.com</li>
          </ul>
        </div>

        <div>
          <h4 className="mb-6 text-sm font-bold uppercase tracking-wider text-white">Follow Us</h4>
          <div className="flex gap-4">
            <a href="https://facebook.com" target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 transition-all hover:bg-orange-500 hover:text-white"><Facebook size={18} /></a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 transition-all hover:bg-orange-500 hover:text-white"><Twitter size={18} /></a>
            <a href="https://instagram.com" target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 transition-all hover:bg-orange-500 hover:text-white"><Instagram size={18} /></a>
          </div>
        </div>
      </div>
      <div className="mt-12 border-t border-gray-800 pt-8 text-center text-xs text-gray-500">
        Copyright 2025 SmartDine. All rights reserved.
      </div>
    </footer>
  );
};

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar transparent />

      <section
        className="relative flex min-h-screen items-center justify-center overflow-hidden pb-10 pt-20"
        style={{ background: 'linear-gradient(135deg, #0b0f1a 0%, #111827 50%, #1a0a00 100%)' }}
      >
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
          <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(234,88,12,0.18) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
          <div className="flex flex-col justify-center space-y-8">
            <div className="inline-flex self-start rounded-full border border-orange-500/30 bg-orange-500/20 px-4 py-2 text-sm font-semibold tracking-wide text-orange-400 backdrop-blur-sm">
              <Star size={14} fill="currentColor" className="mr-2" /> #1 Restaurant App of 2025
            </div>
            <h1 className="text-5xl font-bold leading-[1.1] text-white md:text-7xl">
              Taste the <br />
              <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">SmartDine</span> way.
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-gray-300 md:text-xl">
              Experience a dining journey where guests can log in, view the menu, book a table, order easily, and pay without delays.
            </p>
            <div className="flex flex-col gap-4 pt-4 sm:flex-row">
              <Button
                variant="primary"
                className="h-14 px-8 text-lg"
                fullWidth={false}
                icon={ArrowRight}
                onClick={() => navigate('/login')}
              >
                Show Menu
              </Button>
              <Button
                variant="outline"
                className="h-14 border-white px-8 text-lg text-white hover:bg-white hover:text-gray-900"
                fullWidth={false}
                onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Our Story
              </Button>
            </div>

            <div className="flex items-center gap-6 pt-8 text-sm font-medium text-gray-400">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-orange-500" /> 10k+ Happy Diners
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-orange-500" /> Instant Ordering
              </div>
            </div>
          </div>

          <div className="relative flex h-full w-full items-center justify-center">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/10 blur-[100px]"></div>

            <div className="group relative cursor-pointer animate-float">
              <div className="absolute -right-8 -top-16 z-20 transform transition-all duration-700 ease-in-out group-hover:translate-y-12 group-hover:-rotate-45 group-hover:scale-110">
                <div className="rounded-full border-4 border-gray-100 bg-white p-3 shadow-2xl">
                  <Utensils className="h-12 w-12 -rotate-45 transform text-orange-500" />
                </div>
              </div>

              <div className="relative h-72 w-72 overflow-hidden rounded-full border-8 border-white/10 bg-gray-900 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] md:h-96 md:w-96">
                <img
                  src="https://images.unsplash.com/photo-1591814468924-caf88d1232e1?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110 group-hover:rotate-3"
                  alt="Delicious ramen bowl"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60"></div>
              </div>

              <div className="absolute -bottom-6 -left-4 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-xl backdrop-blur-md transition-transform duration-500 group-hover:scale-105">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-orange-500 p-2 text-sm font-bold text-white">Rs 350</div>
                  <div>
                    <p className="text-sm font-bold text-white">Spicy Miso Ramen</p>
                    <div className="flex text-xs text-orange-400">★★★★★</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="relative overflow-hidden bg-white py-24">
        <div className="absolute right-0 top-0 h-full w-1/3 translate-x-20 skew-x-12 bg-orange-50"></div>
        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-orange-500">About Us</h2>
            <h3 className="text-4xl font-bold text-gray-900">Revolutionizing How You Eat</h3>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { title: 'Smart Ordering', desc: 'No waiting for waiters. Order directly from your table with our interactive digital menu.', icon: ShoppingBag },
              { title: 'Fresh Ingredients', desc: 'We source our produce daily from local organic farms to ensure maximum freshness.', icon: ChefHat },
              { title: 'Instant Payments', desc: 'Settle your bill in seconds with secure integrated payment gateways.', icon: CreditCard }
            ].map((feature, idx) => (
              <TiltCard key={idx} className="group rounded-3xl border border-gray-100 bg-white p-8 shadow-xl hover:shadow-2xl">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 transition-transform duration-300 group-hover:scale-110">
                  <feature.icon size={32} />
                </div>
                <h4 className="mb-4 text-xl font-bold text-gray-900">{feature.title}</h4>
                <p className="leading-relaxed text-gray-500">{feature.desc}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gray-900 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-16 md:grid-cols-2">
            <div>
              <h2 className="mb-6 text-4xl font-bold text-white">Built Around The SmartDine Flow</h2>
              <p className="mb-8 text-lg leading-relaxed text-gray-400">
                SmartDine is designed for the real restaurant journey, from selecting a table to placing orders, calling staff, and paying without delays.
              </p>
              <ul className="mb-8 space-y-4">
                {[
                  'Select your table before ordering',
                  'Track live order progress from the app',
                  'Call a waiter and settle the bill faster'
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-gray-300">
                    <CheckCircle className="text-orange-500" size={20} /> {item}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button variant="primary" fullWidth={false} onClick={() => navigate('/login')}>
                  Book a Table
                </Button>
                <Button variant="outline" fullWidth={false} onClick={() => navigate('/signup')}>
                  Create User Account
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {APP_FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-400">
                    <feature.icon size={22} />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-400">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="reviews" className="bg-orange-50 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-16 text-center text-3xl font-bold text-gray-900">What Our Customers Say</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {REVIEWS.map((review) => (
              <div key={review.id} className="relative mt-6 rounded-2xl bg-white p-8 shadow-lg">
                <div className="absolute -top-6 left-8">
                  <img src={review.img} className="h-12 w-12 rounded-full border-4 border-white object-cover shadow-md" alt={review.name} />
                </div>
                <div className="mb-4 mt-2 flex text-orange-400">
                  {[...Array(review.rating)].map((_, i) => <Star key={i} size={16} fill="currentColor" />)}
                </div>
                <p className="mb-6 italic text-gray-600">"{review.text}"</p>
                <div>
                  <h5 className="font-bold text-gray-900">{review.name}</h5>
                  <span className="text-xs font-semibold uppercase tracking-wide text-orange-500">{review.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
