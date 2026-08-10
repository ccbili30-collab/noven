import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { OnboardingPrototypeApp } from "./OnboardingPrototypeApp"
import "../src/worldbuilder-production.css"
import "./preview.css"
import "./onboarding-prototype.css"

createRoot(document.getElementById("root")!).render(<StrictMode><OnboardingPrototypeApp /></StrictMode>)
