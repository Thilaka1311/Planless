import { ISearchProvider, SearchProviderType } from "../types/provider";
import { GooglePlacesProvider } from "./GooglePlacesProvider";
import { TMDBMovieProvider } from "./TMDBMovieProvider";

class ProviderRegistry {
  private providers = new Map<SearchProviderType, ISearchProvider>();

  constructor() {
    this.register(new GooglePlacesProvider());
    this.register(new TMDBMovieProvider());
  }

  register(provider: ISearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(type: SearchProviderType): ISearchProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      // Default fallback is GooglePlacesProvider
      return this.providers.get("GOOGLE_PLACES") || new GooglePlacesProvider();
    }
    return provider;
  }
}

export const searchProviderRegistry = new ProviderRegistry();
