export interface BlogPost {
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  featured_image: string | null;
  published_at: string | null;
  updated_at: string | null;
}
