type MicrophoneOffIconProps = React.SVGProps<SVGSVGElement>;

export default function MicrophoneOffIcon(props: MicrophoneOffIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-6"
      aria-hidden="true"
      {...props}
    >
      <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
      <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 0 0 7.631 4.677.75.75 0 1 1 .696 1.329A6.751 6.751 0 0 1 5.25 12.75v-1.5A.75.75 0 0 1 6 10.5Zm11.28-1.28a.75.75 0 0 1 1.06 0l1.72 1.72 1.72-1.72a.75.75 0 1 1 1.06 1.06L21.12 12l1.72 1.72a.75.75 0 1 1-1.06 1.06l-1.72-1.72-1.72 1.72a.75.75 0 0 1-1.06-1.06l1.72-1.72-1.72-1.72a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}