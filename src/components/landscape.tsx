export function Landscape({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 800 560"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="mist"
          x1="400"
          y1="0"
          x2="400"
          y2="560"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--land-sky)" />
          <stop offset="1" stopColor="var(--land-water)" />
        </linearGradient>
        <linearGradient
          id="mountain"
          x1="300"
          y1="120"
          x2="450"
          y2="430"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--land-mountain)" />
          <stop offset="1" stopColor="var(--land-sky)" stopOpacity=".1" />
        </linearGradient>
        <linearGradient
          id="near"
          x1="600"
          y1="260"
          x2="700"
          y2="500"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--land-near)" />
          <stop offset="1" stopColor="var(--land-near)" stopOpacity=".12" />
        </linearGradient>
      </defs>
      <rect width="800" height="560" fill="url(#mist)" />
      <circle cx="583" cy="119" r="42" fill="var(--land-sun)" opacity=".7" />
      <path
        d="M0 310 62 234 101 260 163 185 196 210 267 100 301 131 321 117 367 194 399 171 461 266 521 215 552 244 622 166 663 225 698 193 760 277 800 258V440H0Z"
        fill="url(#mountain)"
        opacity=".48"
      />
      <path
        d="m0 355 57-28 44 14 61-61 43 14 52-59 51 41 27-10 73 93 63-16 56-67 34 28 62-87 26 38 36-13 75 104v104H0Z"
        fill="url(#mountain)"
        opacity=".7"
      />
      <path
        d="M507 401c29-38 43-80 71-102l27 17 36-38 34 32 29-18 54 71 42-13v104H503Z"
        fill="url(#near)"
      />
      <path
        d="M0 437c95-28 155-21 230-14s180 32 270 1 158-19 300-6v142H0Z"
        fill="var(--land-water)"
        opacity=".7"
      />
      <path
        d="M0 463c128-18 239 15 347 8s240-24 453-5M123 495c88-9 172 14 291 1M467 521c71-7 151-6 219 0"
        stroke="var(--land-line)"
        opacity=".25"
        strokeWidth="2"
      />
      <path
        d="M28 418c56-18 80-24 134-14l62 22-32 12-139 2Z"
        fill="var(--land-near)"
        opacity=".45"
      />
      <g stroke="var(--land-ink)" strokeWidth="4">
        <path d="M85 409v-64m64 64v-64m-75 65h89m-77-26h62m-79-42h95" />
        <path
          d="M62 344c23-6 36-18 56-36 15 17 33 31 57 36l-17 7H78Z"
          fill="var(--land-ink)"
        />
        <path d="M70 337c20-6 36-17 48-30 16 16 33 26 49 30" strokeWidth="2" />
        <path d="M118 307v-11m-45 56v-9m89 9v-9" />
      </g>
      <g fill="var(--land-ink)" opacity=".48">
        <path d="M18 403 31 315l13 88ZM43 408l14-113 14 113ZM183 416l13-87 14 87ZM218 422l12-67 12 67Z" />
      </g>
      <g stroke="var(--land-ink)" strokeWidth="3" opacity=".48">
        <path d="M0 53c64-4 102 4 146 47M45 54l22-35m24 48 32-31m-4 49 46-8" />
      </g>
      <g fill="var(--land-near)" opacity=".75">
        <ellipse cx="57" cy="30" rx="23" ry="9" transform="rotate(-33 57 30)" />
        <ellipse cx="86" cy="48" rx="23" ry="9" transform="rotate(20 86 48)" />
        <ellipse
          cx="121"
          cy="40"
          rx="23"
          ry="9"
          transform="rotate(-28 121 40)"
        />
        <ellipse cx="140" cy="77" rx="23" ry="9" />
        <ellipse cx="34" cy="55" rx="23" ry="9" />
        <ellipse
          cx="155"
          cy="102"
          rx="20"
          ry="8"
          transform="rotate(32 155 102)"
        />
      </g>
      <path
        d="m443 147 7-3 8 3m23 13 6-3 7 3"
        stroke="var(--land-ink)"
        strokeWidth="2"
        opacity=".4"
      />
      <g opacity=".17" transform="translate(0 840) scale(1 -1)">
        <path
          d="M85 409v-64m64 64v-64m-75 65h89"
          stroke="var(--land-ink)"
          strokeWidth="4"
        />
        <path d="m62 344 56-36 57 36-17 7H78Z" fill="var(--land-ink)" />
      </g>
    </svg>
  );
}
