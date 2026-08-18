import React, { useState } from 'react';
import { Check } from 'lucide-react';

interface CountryOption {
  id: string;
  name: string;
  flag: string;
  regionSystem: string;
}

const COUNTRIES: CountryOption[] = [
  { id: 'us', name: 'United States', flag: '🇺🇸', regionSystem: 'USA' },
  { id: 'uk', name: 'United Kingdom', flag: '🇬🇧', regionSystem: 'UK' },
  { id: 'ca', name: 'Canada', flag: '🇨🇦', regionSystem: 'CA' },
  { id: 'au', name: 'Australia', flag: '🇦🇺', regionSystem: 'AU' },
  { id: 'global', name: 'Others / International', flag: '🌍', regionSystem: 'Global' },
];

interface CountrySelectorProps {
  onSelectCountry?: (country: CountryOption) => void;
  onContinue?: (country: CountryOption) => void;
  initialSelectedId?: string;
}

export const CountrySelector: React.FC<CountrySelectorProps> = ({
  onSelectCountry,
  onContinue,
  initialSelectedId = ''
}) => {
  const [selectedId, setSelectedId] = useState<string>(initialSelectedId);

  const selectedCountry = COUNTRIES.find((c) => c.id === selectedId);

  const handleSelect = (country: CountryOption) => {
    setSelectedId(country.id);
    if (onSelectCountry) {
      onSelectCountry(country);
    }
  };

  const handleContinue = () => {
    if (!selectedCountry) return;
    console.log('Selected Country:', selectedCountry);
    if (onContinue) {
      onContinue(selectedCountry);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white/90 backdrop-blur-md rounded-3xl border border-zinc-200/80 shadow-xl shadow-zinc-200/40">
      <div className="text-center mb-6">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-100 mb-2">
          Step 1 of 3
        </span>
        <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight">Select Your Country</h2>
        <p className="text-xs text-zinc-500 font-medium mt-1">
          We will customize your exam curricula and subject titles to match your region.
        </p>
      </div>

      <div className="space-y-2.5 mb-6">
        {COUNTRIES.map((country) => {
          const isSelected = selectedId === country.id;
          return (
            <button
              key={country.id}
              type="button"
              onClick={() => handleSelect(country)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                isSelected
                  ? 'bg-purple-50/60 border-purple-600 ring-2 ring-purple-600/20 shadow-md shadow-purple-100'
                  : 'bg-white border-zinc-200/90 hover:border-zinc-300 hover:bg-zinc-50/80 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <span className="text-2xl filter drop-shadow-sm select-none">{country.flag}</span>
                <span className={`text-sm font-bold ${isSelected ? 'text-purple-950' : 'text-zinc-800'}`}>
                  {country.name}
                </span>
              </div>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-300'
                    : 'border-2 border-zinc-200 bg-zinc-50'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!selectedId}
        onClick={handleContinue}
        className={`w-full py-3.5 px-6 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
          selectedId
            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-purple-200 active:scale-[0.99]'
            : 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed shadow-none'
        }`}
      >
        <span>Continue</span>
        <span className="text-base">→</span>
      </button>
    </div>
  );
};

export default CountrySelector;
