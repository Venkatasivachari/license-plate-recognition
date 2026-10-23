import { useEffect, useRef } from "react";

/**
 * CyberBackground — High-performance 3D perspective animated canvas.
 * Variants:
 *  - "login": 3D Cyber Highway perspective lines scrolling forward into the horizon.
 *  - "admin": 3D Tactical Telemetry Matrix with radar rings, scanning coordinates, and node mesh.
 *  - "customer": Streamlined 3D luminous neon wave streams with ambient drifting constellations.
 */
export function CyberBackground({ variant = "login" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return undefined;

    let animId = 0;
    let width = Math.max(1, window.innerWidth || 1);
    let height = Math.max(1, window.innerHeight || 1);
    let dpr = 1;

    const resize = () => {
      const devicePixelRatio = window.devicePixelRatio;
      dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? Math.min(devicePixelRatio, 2) : 1;
      width = Math.max(1, window.innerWidth || 1);
      height = Math.max(1, window.innerHeight || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Simulation states
    let time = 0;

    // Highway streaks for Login
    const streaks = Array.from({ length: 28 }, () => ({
      lane: Math.random() * 2 - 1, // -1 to 1
      z: Math.random() * 1000 + 50,
      speed: 8 + Math.random() * 12,
      length: 60 + Math.random() * 90,
      color: Math.random() > 0.4 ? "rgba(99, 102, 241, " : "rgba(6, 182, 214, ",
    }));

    // Data nodes for Admin
    const nodes = Array.from({ length: 42 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 2 + 1,
      color: Math.random() > 0.3 ? "rgba(99, 102, 241, " : "rgba(6, 182, 214, ",
    }));

    // Stars for background depth
    const stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight * 0.5,
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.7 + 0.2,
      twinkle: Math.random() * 0.02 + 0.005,
    }));

    const render = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      if (variant === "login") {
        // ==========================================
        // VARIANT: 3D CYBER HIGHWAY PERSPECTIVE
        // ==========================================
        const horizonY = h * 0.46;
        const vanishingX = w * 0.5;

        // Ambient background gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, "#050811");
        bgGrad.addColorStop(0.46, "#090f1f");
        bgGrad.addColorStop(0.48, "#0d1830");
        bgGrad.addColorStop(1, "#070b14");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Distant stars / sky particles
        stars.forEach((s) => {
          s.alpha += Math.sin(time * s.twinkle) * 0.01;
          const clampedAlpha = Math.max(0.1, Math.min(0.9, s.alpha));
          ctx.fillStyle = `rgba(180, 205, 255, ${clampedAlpha})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
        });

        // Horizon glow line
        const horizonGlow = ctx.createLinearGradient(0, horizonY - 15, 0, horizonY + 25);
        horizonGlow.addColorStop(0, "rgba(99, 102, 241, 0)");
        horizonGlow.addColorStop(0.5, "rgba(99, 102, 241, 0.35)");
        horizonGlow.addColorStop(1, "rgba(6, 182, 214, 0)");
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(0, horizonY - 15, w, 40);

        ctx.strokeStyle = "rgba(129, 140, 248, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(w, horizonY);
        ctx.stroke();

        // 3D Perspective Highway Grid Lines
        const numLanes = 16;
        for (let i = -numLanes / 2; i <= numLanes / 2; i++) {
          const spread = (i / (numLanes / 2)) * (w * 0.95);
          const bottomX = vanishingX + spread * 1.6;
          const topX = vanishingX + spread * 0.03;

          const isCenter = i === 0;
          const isMajor = i % 4 === 0;
          ctx.strokeStyle = isCenter
            ? "rgba(245, 158, 11, 0.45)"
            : isMajor
              ? "rgba(6, 182, 214, 0.28)"
              : "rgba(99, 102, 241, 0.12)";
          ctx.lineWidth = isCenter ? 2 : isMajor ? 1.5 : 1;

          ctx.beginPath();
          ctx.moveTo(topX, horizonY);
          ctx.lineTo(bottomX, h);
          ctx.stroke();
        }

        // Horizontal Grid Cross Lines moving forward toward viewer
        const speed = prefersReduced ? 0 : (time * 0.8) % 60;
        const gridSteps = 18;
        for (let j = 1; j <= gridSteps; j++) {
          const rawProgress = (j * 60 + speed) / (gridSteps * 60);
          const progress = Math.pow(rawProgress, 3); // exponential perspective projection
          const y = horizonY + progress * (h - horizonY);
          const lineAlpha = Math.min(1, progress * 1.4) * 0.22;

          ctx.strokeStyle = `rgba(99, 102, 241, ${lineAlpha})`;
          ctx.lineWidth = 1 + progress * 1.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        // Velocity Streaks rushing down the lanes
        if (!prefersReduced) {
          streaks.forEach((st) => {
            st.z -= st.speed;
            if (st.z <= 10) {
              st.z = 1000;
              st.lane = (Math.random() * 2 - 1) * 0.85;
            }
            const depthProgress = 1 - st.z / 1000;
            const expDepth = Math.pow(depthProgress, 2.8);
            const startY = horizonY + expDepth * (h - horizonY);
            const startX = vanishingX + st.lane * (w * 0.8) * Math.pow(depthProgress, 1.8);

            const tailDepth = Math.max(0.01, depthProgress - st.length / 1000);
            const expTail = Math.pow(tailDepth, 2.8);
            const tailY = horizonY + expTail * (h - horizonY);
            const tailX = vanishingX + st.lane * (w * 0.8) * Math.pow(tailDepth, 1.8);

            const alpha = Math.min(1, depthProgress * 1.8) * 0.7;
            if (![tailX, tailY, startX, startY, alpha].every(Number.isFinite)) {
              st.z = 1000;
              return;
            }
            const grad = ctx.createLinearGradient(tailX, tailY, startX, startY);
            grad.addColorStop(0, `${st.color}0)`);
            grad.addColorStop(1, `${st.color}${alpha})`);

            ctx.strokeStyle = grad;
            ctx.lineWidth = Math.max(1.5, depthProgress * 3.5);
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(startX, startY);
            ctx.stroke();

            // Head glow point
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
            ctx.beginPath();
            ctx.arc(startX, startY, Math.max(1, depthProgress * 2.5), 0, Math.PI * 2);
            ctx.fill();
          });
        }
      } else if (variant === "admin") {
        // ==========================================
        // VARIANT: 3D TACTICAL TELEMETRY MATRIX
        // ==========================================
        // Ambient tactical dark base
        ctx.fillStyle = "#070b12";
        ctx.fillRect(0, 0, w, h);

        // 3D Isometric / Matrix Grid
        const gridSize = 48;
        const gridAlpha = 0.05;
        ctx.strokeStyle = `rgba(99, 102, 241, ${gridAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = 0; y <= h; y += gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();

        // High-tech Scanning Laser line moving top to bottom
        const scanY = prefersReduced ? h * 0.5 : (time * 1.5) % (h + 200) - 100;
        const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
        scanGrad.addColorStop(0, "rgba(6, 182, 214, 0)");
        scanGrad.addColorStop(0.5, "rgba(6, 182, 214, 0.12)");
        scanGrad.addColorStop(1, "rgba(6, 182, 214, 0)");
        ctx.fillStyle = scanGrad;
        ctx.fillRect(0, scanY - 30, w, 60);

        ctx.strokeStyle = "rgba(6, 182, 214, 0.35)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(w, scanY);
        ctx.stroke();

        // Holographic Tactical Radar Sweep (top right corner)
        const radarX = w - Math.min(260, w * 0.22);
        const radarY = Math.min(260, h * 0.25);
        const radarRadius = Math.min(180, w * 0.16);

        // Radar Rings
        [0.35, 0.65, 1.0].forEach((ratio) => {
          ctx.strokeStyle = "rgba(6, 182, 214, 0.12)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(radarX, radarY, radarRadius * ratio, 0, Math.PI * 2);
          ctx.stroke();
        });

        // Crosshairs
        ctx.strokeStyle = "rgba(6, 182, 214, 0.08)";
        ctx.beginPath();
        ctx.moveTo(radarX - radarRadius, radarY);
        ctx.lineTo(radarX + radarRadius, radarY);
        ctx.moveTo(radarX, radarY - radarRadius);
        ctx.lineTo(radarX, radarY + radarRadius);
        ctx.stroke();

        // Rotating radar beam
        if (!prefersReduced) {
          const angle = (time * 0.025) % (Math.PI * 2);
          const sweepGrad = ctx.createRadialGradient(radarX, radarY, 0, radarX, radarY, radarRadius);
          sweepGrad.addColorStop(0, "rgba(6, 182, 214, 0.25)");
          sweepGrad.addColorStop(1, "rgba(6, 182, 214, 0)");

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(radarX, radarY);
          ctx.arc(radarX, radarY, radarRadius, angle - 0.45, angle);
          ctx.closePath();
          ctx.fillStyle = sweepGrad;
          ctx.fill();

          ctx.strokeStyle = "rgba(6, 182, 214, 0.4)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(radarX, radarY);
          ctx.lineTo(radarX + Math.cos(angle) * radarRadius, radarY + Math.sin(angle) * radarRadius);
          ctx.stroke();
          ctx.restore();
        }

        // Drifting Connected Telemetry Nodes
        nodes.forEach((node, i) => {
          if (!prefersReduced) {
            node.x += node.vx;
            node.y += node.vy;
            if (node.x < 0 || node.x > w) node.vx *= -1;
            if (node.y < 0 || node.y > h) node.vy *= -1;
          }

          ctx.fillStyle = `${node.color}0.6)`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fill();

          // Connect to nearby nodes
          for (let j = i + 1; j < nodes.length; j++) {
            const other = nodes[j];
            const dist = Math.hypot(node.x - other.x, node.y - other.y);
            if (dist < 110) {
              const alpha = (1 - dist / 110) * 0.14;
              ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(node.x, node.y);
              ctx.lineTo(other.x, other.y);
              ctx.stroke();
            }
          }
        });
      } else {
        // ==========================================
        // VARIANT: 3D STREAMLINED NEON FLOW (CUSTOMER)
        // ==========================================
        ctx.fillStyle = "#070b12";
        ctx.fillRect(0, 0, w, h);

        // Undulating 3D ribbons / curves
        const numRibbons = 5;
        for (let r = 0; r < numRibbons; r++) {
          const yOffset = h * 0.35 + r * (h * 0.12);
          const color = r % 2 === 0 ? "rgba(99, 102, 241, " : "rgba(245, 158, 11, ";
          const alpha = 0.12 - r * 0.015;

          ctx.strokeStyle = `${color}${alpha})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();

          for (let x = 0; x <= w; x += 16) {
            const wave1 = Math.sin(x * 0.003 + time * 0.018 + r * 1.2) * 45;
            const wave2 = Math.cos(x * 0.0015 - time * 0.012 + r * 0.8) * 30;
            const y = yOffset + wave1 + wave2;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // Ambient drifting speed particles
        nodes.slice(0, 24).forEach((node) => {
          if (!prefersReduced) {
            node.x += node.vx * 0.8;
            node.y += node.vy * 0.8;
            if (node.x < 0 || node.x > w) node.vx *= -1;
            if (node.y < 0 || node.y > h) node.vy *= -1;
          }
          ctx.fillStyle = `${node.color}0.45)`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 1.2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      time += 1;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
        display: "none",
      }}
    />
  );
}
