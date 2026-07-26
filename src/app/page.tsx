import Header from '@/components/Header'
import Hero from '@/components/Hero'
import TrustedBy from '@/components/TrustedBy'
import Features from '@/components/Features'
import Workflow from '@/components/Workflow'
import CTA from '@/components/CTA'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <div className="min-h-screen bg-[#07111F] text-white">
      <Header />
      <main>
        <Hero />
        <TrustedBy />
        <Features />
        <Workflow />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
