import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { GeminiService, LandmarkInfo, DirectionsInfo } from './services/gemini.service';

type AppState =
  | { status: 'initial' }
  | { status: 'loading'; message: string }
  | { status: 'result'; data: LandmarkInfo; imageUrl: string; imageBase64: string; mimeType: string; }
  | { status: 'error'; message: string };

const uiStrings = {
  en: {
    title: 'Landmark Lens',
    subtitle: 'Discover the history behind any landmark. Just upload a photo to get started.',
    uploadButton: 'Upload Photo & Identify',
    loading: {
      analyzing: 'Analyzing your image...',
      generatingInfo: 'Retrieving history...',
      directions: 'Generating your route...',
    },
    error: {
      title: 'An Error Occurred',
      invalidFile: 'Please upload a valid image file (JPEG, PNG, WebP, HEIC, or RAW).',
    },
    tryAgainButton: 'Try Again',
    sourcesTitle: 'Sources',
    analyzeAnotherButton: 'Analyze Another Landmark',
    getDirectionsButton: 'Get Directions',
    directionsFormTitle: 'Where are you starting from?',
    fullAddressLabel: 'Your Full Address',
    fullAddressPlaceholder: 'e.g., 1600 Amphitheatre Parkway, Mountain View, CA',
    findRouteButton: 'Find Route',
    cancelButton: 'Cancel',
    directionsTitle: 'Your Route',
    openInMapsButton: 'Open in Google Maps',
    clearDirectionsButton: 'Clear Directions'
  },
  id: {
    title: 'Lensa Markah Tanah',
    subtitle: 'Temukan sejarah di balik markah tanah apa pun. Cukup unggah foto untuk memulai.',
    uploadButton: 'Unggah Foto & Identifikasi',
    loading: {
      analyzing: 'Menganalisis gambar Anda...',
      generatingInfo: 'Mengambil data sejarah...',
      directions: 'Membuat rute Anda...',
    },
    error: {
      title: 'Terjadi Kesalahan',
      invalidFile: 'Harap unggah file gambar yang valid (JPEG, PNG, WebP, HEIC, atau RAW).',
    },
    tryAgainButton: 'Coba Lagi',
    sourcesTitle: 'Sumber',
    analyzeAnotherButton: 'Analisis Markah Tanah Lain',
    getDirectionsButton: 'Dapatkan Arah',
    directionsFormTitle: 'Anda mulai dari mana?',
    fullAddressLabel: 'Alamat Lengkap Anda',
    fullAddressPlaceholder: 'cth., Jalan Jenderal Sudirman Kav. 52-53, Jakarta Selatan',
    findRouteButton: 'Cari Rute',
    cancelButton: 'Batal',
    directionsTitle: 'Rute Anda',
    openInMapsButton: 'Buka di Google Maps',
    clearDirectionsButton: 'Hapus Arah'
  }
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AppComponent {
  private geminiService = inject(GeminiService);

  state = signal<AppState>({ status: 'initial' });
  language = signal<'en' | 'id'>('en');
  
  showDirectionsForm = signal(false);
  directions = signal<DirectionsInfo | null>(null);
  directionsLoading = signal(false);
  directionsForm: FormGroup;
  isTranslating = signal(false);

  uiText = computed(() => uiStrings[this.language()]);

  constructor() {
    this.directionsForm = new FormGroup({
      fullAddress: new FormControl('', [Validators.required]),
    });
  }

  async setLanguage(lang: 'en' | 'id') {
    const currentLang = this.language();
    if (lang === currentLang) return;

    this.language.set(lang);

    const currentState = this.state();
    if (currentState.status === 'result') {
      this.isTranslating.set(true);
      try {
        const { imageBase64, mimeType, imageUrl } = currentState;
        
        // Re-fetch landmark info
        const landmarkInfo = await this.geminiService.getLandmarkInfo(imageBase64, mimeType, lang);
        this.state.set({ status: 'result', data: landmarkInfo, imageUrl, imageBase64, mimeType });

        // Re-fetch directions if they exist
        if (this.directions() && this.directionsForm.value.fullAddress) {
           const origin = this.directionsForm.value.fullAddress;
           const destination = landmarkInfo.name;
           const directionsInfo = await this.geminiService.getDirections(destination, origin, lang);
           this.directions.set(directionsInfo);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during translation.';
        this.state.set({ status: 'error', message: errorMessage });
      } finally {
        this.isTranslating.set(false);
      }
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }

    const file = input.files[0];

    const isStandardImage = file.type.startsWith('image/');
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const allowedRawExtensions = ['dng', 'cr2', 'cr3', 'nef', 'arw', 'heic'];
    const isAllowedRaw = fileExtension ? allowedRawExtensions.includes(fileExtension) : false;

    if (!isStandardImage && !isAllowedRaw) {
      this.state.set({ status: 'error', message: this.uiText().error.invalidFile });
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const imageBase64 = await this.fileToBase64(file);
    const mimeType = isStandardImage ? file.type : 'image/jpeg';

    this.state.set({ status: 'loading', message: this.uiText().loading.analyzing });
    
    try {
      // FIX: `generatingInfo` is a string property, not a function. Removed incorrect function call `()`.
      this.state.set({ status: 'loading', message: this.uiText().loading.generatingInfo });
      const landmarkInfo = await this.geminiService.getLandmarkInfo(imageBase64, mimeType, this.language());
      
      this.state.set({ 
        status: 'result', 
        data: landmarkInfo,
        imageUrl,
        imageBase64,
        mimeType
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      this.state.set({ status: 'error', message: errorMessage });
    }
  }

  async onGetDirectionsSubmit() {
    if (this.directionsForm.invalid || this.state().status !== 'result') return;
    
    this.directionsLoading.set(true);
    this.directions.set(null);
    
    const origin = this.directionsForm.value.fullAddress;
    const currentState = this.state();
    if (currentState.status !== 'result') return;

    const destination = currentState.data.name;
    
    try {
      const result = await this.geminiService.getDirections(destination, origin, this.language());
      this.directions.set(result);
      this.showDirectionsForm.set(false);
    } catch (error) {
      // For simplicity, we log the error. A more robust solution could show a toast message.
      console.error("Could not get directions", error);
    } finally {
      this.directionsLoading.set(false);
    }
  }

  reset() {
    this.state.set({ status: 'initial' });
    this.showDirectionsForm.set(false);
    this.directions.set(null);
    this.directionsLoading.set(false);
    this.directionsForm.reset();

    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = (error) => reject(error);
    });
  }
}
